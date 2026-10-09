-- Phase 3 / 0011: optional Web Push. Does nothing unless users subscribe a device (needs VAPID keys in the app).

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;
create policy push_select on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_insert on push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_delete on push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke update on push_subscriptions from authenticated, anon;

alter table notifications
  add column push_status text not null default 'skipped' check (push_status in ('pending', 'sent', 'skipped', 'failed')),
  add column push_attempts int not null default 0,
  add column push_claimed_at timestamptz;
create index notifications_pending_push_idx on notifications(created_at) where push_status = 'pending';

-- notify(): same as 0005 plus push_status (pending when the recipient has a subscribed device).
create or replace function public.notify(
  p_users uuid[], p_type text, p_creative uuid, p_actor uuid,
  p_payload jsonb default '{}', p_comment uuid default null, p_message uuid default null,
  p_dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
declare u uuid; pref boolean; push boolean;
begin
  for u in select distinct x from unnest(coalesce(p_users, '{}')) x loop
    if u is null or u is not distinct from p_actor then continue; end if;
    if not exists (select 1 from profiles where id = u and active) then continue; end if;
    select email into pref from notification_preferences where user_id = u and event_type = p_type;
    pref := coalesce(pref, default_email_pref(p_type));
    push := default_email_pref(p_type) and exists (select 1 from push_subscriptions where user_id = u);
    insert into notifications(user_id, type, creative_id, actor_id, payload, comment_id, message_id,
                              dedupe_key, email_status, push_status)
    values (u, p_type, p_creative, p_actor, coalesce(p_payload, '{}'), p_comment, p_message,
            case when p_dedupe is null then null else p_dedupe || ':' || u end,
            case when pref then 'pending' else 'skipped' end,
            case when push then 'pending' else 'skipped' end)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;
end $$;

create or replace function public.guard_notification_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and (
       new.user_id is distinct from old.user_id or new.type is distinct from old.type
       or new.creative_id is distinct from old.creative_id or new.payload is distinct from old.payload
       or new.actor_id is distinct from old.actor_id or new.comment_id is distinct from old.comment_id
       or new.message_id is distinct from old.message_id or new.email_status is distinct from old.email_status
       or new.email_attempts is distinct from old.email_attempts or new.email_claimed_at is distinct from old.email_claimed_at
       or new.push_status is distinct from old.push_status or new.push_attempts is distinct from old.push_attempts
       or new.push_claimed_at is distinct from old.push_claimed_at
       or new.created_at is distinct from old.created_at) then
    raise exception 'only read_at can be changed';
  end if;
  return new;
end $$;

-- Atomically claim pending pushes (the app looks up the recipient's subscriptions).
create or replace function public.claim_pending_pushes(p_limit int default 50)
returns table (id uuid, user_id uuid, type text, creative_id uuid, comment_id uuid, message_id uuid,
               payload jsonb, actor_id uuid, attempts int)
language sql security definer set search_path = public as $$
  with c as (
    select n.id from notifications n
    where n.push_status = 'pending' and n.push_attempts < 3
      and n.created_at > now() - interval '1 day'
      and (n.push_claimed_at is null or n.push_claimed_at < now() - interval '2 minutes')
    order by n.created_at limit p_limit for update skip locked)
  update notifications n set push_attempts = n.push_attempts + 1, push_claimed_at = now()
  from c where n.id = c.id
  returning n.id, n.user_id, n.type, n.creative_id, n.comment_id, n.message_id, n.payload, n.actor_id, n.push_attempts
$$;
revoke execute on function public.claim_pending_pushes(int) from public, anon, authenticated;
