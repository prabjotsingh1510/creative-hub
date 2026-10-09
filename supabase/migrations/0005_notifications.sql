-- Phase 2 / 0005: notifications engine, preferences, due-date reminders.
-- Notifications are created ONLY by database triggers / security-definer functions,
-- so no client (or UI bug) can skip or forge them.

alter table notifications
  add column actor_id uuid references profiles(id),
  add column comment_id uuid references comments(id),
  add column message_id uuid references messages(id),
  add column dedupe_key text,
  add column email_status text not null default 'skipped'
    check (email_status in ('pending', 'sent', 'skipped', 'failed')),
  add column email_attempts int not null default 0,
  add column email_claimed_at timestamptz;

alter table notifications add constraint notifications_type_check check (type in (
  'mention', 'comment', 'request_created', 'version_uploaded', 'status_changed',
  'live_state_changed', 'due_soon', 'overdue', 'channel_mention', 'reply'));

create unique index notifications_dedupe_idx on notifications(dedupe_key) where dedupe_key is not null;
create index notifications_user_created_idx on notifications(user_id, created_at desc);
create index notifications_unread_idx on notifications(user_id) where read_at is null;
create index notifications_pending_email_idx on notifications(created_at) where email_status = 'pending';

-- Preferences -------------------------------------------------------------------------
alter table profiles add column daily_digest boolean not null default false;

create table notification_preferences (
  user_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  email boolean not null,
  primary key (user_id, event_type)
);
alter table notification_preferences enable row level security;
create policy prefs_select on notification_preferences for select to authenticated using (user_id = auth.uid());
create policy prefs_insert on notification_preferences for insert to authenticated with check (user_id = auth.uid());
create policy prefs_update on notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke delete on notification_preferences from authenticated, anon;

-- Default email preference when the user has no explicit row. Noisy events default to off.
create or replace function public.default_email_pref(p_type text) returns boolean
language sql immutable as $$
  select p_type not in ('comment', 'channel_mention', 'reply')
$$;

-- Helpers -----------------------------------------------------------------------------
create or replace function public.users_with_roles(p_roles user_role[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from profiles where active and role = any(p_roles)
$$;

-- The one place notifications are created. Never notifies the actor; skips inactive users;
-- decides email status from the recipient's preference. dedupe_key is made per-user.
create or replace function public.notify(
  p_users uuid[], p_type text, p_creative uuid, p_actor uuid,
  p_payload jsonb default '{}', p_comment uuid default null, p_message uuid default null,
  p_dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
declare u uuid; pref boolean;
begin
  for u in select distinct x from unnest(coalesce(p_users, '{}')) x loop
    if u is null or u is not distinct from p_actor then continue; end if;
    if not exists (select 1 from profiles where id = u and active) then continue; end if;
    select email into pref from notification_preferences where user_id = u and event_type = p_type;
    pref := coalesce(pref, default_email_pref(p_type));
    insert into notifications(user_id, type, creative_id, actor_id, payload, comment_id, message_id,
                              dedupe_key, email_status)
    values (u, p_type, p_creative, p_actor, coalesce(p_payload, '{}'), p_comment, p_message,
            case when p_dedupe is null then null else p_dedupe || ':' || u end,
            case when pref then 'pending' else 'skipped' end)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;
end $$;

-- Triggers ----------------------------------------------------------------------------
create or replace function public.trg_notify_request_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify(users_with_roles('{creative}'), 'request_created', new.id, new.created_by,
                 jsonb_build_object('title', new.title, 'due_date', new.due_date));
  return new;
end $$;
create trigger notify_request_created after insert on creatives
  for each row execute function trg_notify_request_created();

create or replace function public.trg_notify_version_uploaded() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select title into t from creatives where id = new.creative_id;
  perform notify(users_with_roles('{admin,ads}'), 'version_uploaded', new.creative_id, new.uploaded_by,
                 jsonb_build_object('title', t, 'version_no', new.version_no));
  return new;
end $$;
create trigger notify_version_uploaded after insert on creative_versions
  for each row execute function trg_notify_version_uploaded();

create or replace function public.trg_notify_creative_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare recipients uuid[]; actor uuid := auth.uid();
begin
  if new.live_state is distinct from old.live_state then
    perform notify(users_with_roles('{admin,creative}'), 'live_state_changed', new.id, actor,
                   jsonb_build_object('title', new.title, 'from', old.live_state, 'to', new.live_state));
  elsif new.status is distinct from old.status then
    -- upload-driven "submitted" is already covered by version_uploaded
    if new.status = 'submitted' and new.current_version_id is distinct from old.current_version_id then
      return new;
    end if;
    recipients := case new.status
      when 'submitted' then users_with_roles('{admin}')
      when 'changes_requested' then users_with_roles('{creative}')
      when 'approved' then users_with_roles('{creative}')
      when 'requested' then users_with_roles('{creative}')
      when 'sent_to_ads' then users_with_roles('{ads}')
      else users_with_roles('{admin,creative}')
    end;
    perform notify(recipients, 'status_changed', new.id, actor,
                   jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger notify_creative_update after update on creatives
  for each row execute function trg_notify_creative_update();

create or replace function public.trg_notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; recipients uuid[];
begin
  select title into t from creatives where id = new.creative_id;
  select coalesce(array_agg(distinct u), '{}') into recipients from (
    select created_by u from creatives where id = new.creative_id
    union select uploaded_by from creative_versions where creative_id = new.creative_id) s;
  perform notify(recipients, 'comment', new.creative_id, new.author_id,
                 jsonb_build_object('title', t, 'snippet', left(new.body, 140)), new.id);
  return new;
end $$;
create trigger notify_comment after insert on comments
  for each row execute function trg_notify_comment();

-- A mention replaces the generic "new comment" ping for that person (no double notification).
create or replace function public.trg_notify_mention() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; t text;
begin
  select creative_id, author_id, body into c from comments where id = new.comment_id;
  select title into t from creatives where id = c.creative_id;
  delete from notifications where user_id = new.user_id and comment_id = new.comment_id and type = 'comment';
  perform notify(array[new.user_id], 'mention', c.creative_id, c.author_id,
                 jsonb_build_object('title', t, 'snippet', left(c.body, 140)), new.comment_id);
  return new;
end $$;
create trigger notify_mention after insert on mentions
  for each row execute function trg_notify_mention();

-- Notification RLS: own rows only; clients may only set read_at ----------------------------
create policy notif_read_own on notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_read on notifications;
drop policy if exists notif_update on notifications;
create policy notif_update_own on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on notifications from authenticated, anon;

create or replace function public.guard_notification_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and (
       new.user_id is distinct from old.user_id or new.type is distinct from old.type
       or new.creative_id is distinct from old.creative_id or new.payload is distinct from old.payload
       or new.actor_id is distinct from old.actor_id or new.comment_id is distinct from old.comment_id
       or new.message_id is distinct from old.message_id or new.email_status is distinct from old.email_status
       or new.email_attempts is distinct from old.email_attempts or new.created_at is distinct from old.created_at) then
    raise exception 'only read_at can be changed';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on notifications
  for each row execute function guard_notification_update();

create or replace function public.mark_all_notifications_read() returns int
language plpgsql security invoker as $$
declare n int;
begin
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Due-date reminders -----------------------------------------------------------------
create table due_reminders (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives(id),
  kind text not null check (kind in ('due_soon', 'overdue')),
  due_date date not null,
  created_at timestamptz not null default now(),
  unique (creative_id, kind, due_date)
);
alter table due_reminders enable row level security;   -- no policies: service/definer only

-- Idempotent: each (creative, kind, due_date) fires once. Moving the due date re-arms it.
-- due_soon: from 00:00 IST on the due date (24h before the end-of-day deadline) until the deadline.
-- overdue: after 23:59:59 IST of the due date. Only creatives with no submission yet.
create or replace function public.generate_due_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; ins int; total int := 0;
begin
  for r in
    select id, title, due_date from creatives
    where deleted_at is null and submitted_at is null and due_date is not null
      and now() >= (due_date::timestamp at time zone 'Asia/Kolkata')
      and now() < ((due_date + 1)::timestamp at time zone 'Asia/Kolkata')
  loop
    insert into due_reminders(creative_id, kind, due_date) values (r.id, 'due_soon', r.due_date)
      on conflict do nothing;
    get diagnostics ins = row_count;
    if ins > 0 then
      perform notify(users_with_roles('{creative}'), 'due_soon', r.id, null,
        jsonb_build_object('title', r.title, 'due_date', r.due_date), null, null,
        'due_soon:' || r.id || ':' || r.due_date);
      total := total + 1;
    end if;
  end loop;

  for r in
    select id, title, due_date from creatives
    where deleted_at is null and submitted_at is null and due_date is not null
      and now() >= ((due_date + 1)::timestamp at time zone 'Asia/Kolkata')
  loop
    insert into due_reminders(creative_id, kind, due_date) values (r.id, 'overdue', r.due_date)
      on conflict do nothing;
    get diagnostics ins = row_count;
    if ins > 0 then
      perform notify(users_with_roles('{creative,admin}'), 'overdue', r.id, null,
        jsonb_build_object('title', r.title, 'due_date', r.due_date), null, null,
        'overdue:' || r.id || ':' || r.due_date);
      total := total + 1;
    end if;
  end loop;
  return total;
end $$;

-- Email dispatch support -------------------------------------------------------------
-- Atomically claim pending emails (safe if two dispatchers overlap).
create or replace function public.claim_pending_emails(p_limit int default 50)
returns table (id uuid, user_id uuid, email text, name text, type text, creative_id uuid,
               comment_id uuid, message_id uuid, payload jsonb, attempts int, created_at timestamptz)
language sql security definer set search_path = public as $$
  with c as (
    select n.id from notifications n
    where n.email_status = 'pending' and n.email_attempts < 3
      and n.created_at > now() - interval '2 days'
      and (n.email_claimed_at is null or n.email_claimed_at < now() - interval '5 minutes')
    order by n.created_at limit p_limit for update skip locked)
  update notifications n set email_attempts = n.email_attempts + 1, email_claimed_at = now()
  from c, profiles p
  where n.id = c.id and p.id = n.user_id
  returning n.id, n.user_id, p.email, p.name, n.type, n.creative_id, n.comment_id, n.message_id,
            n.payload, n.email_attempts, n.created_at
$$;

create table digest_log (
  user_id uuid not null references profiles(id) on delete cascade,
  sent_on date not null,
  primary key (user_id, sent_on)
);
alter table digest_log enable row level security;   -- no policies: service role only

-- Internal functions are not callable by clients.
revoke execute on function public.notify(uuid[], text, uuid, uuid, jsonb, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.users_with_roles(user_role[]) from public, anon, authenticated;
revoke execute on function public.generate_due_reminders() from public, anon, authenticated;
revoke execute on function public.claim_pending_emails(int) from public, anon, authenticated;
