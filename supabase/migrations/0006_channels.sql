-- Phase 2 / 0006: General channel (schema is multi-channel so "Ads strategy" etc. need no migration).

alter table channels
  add column slug text,
  add column description text,
  add column allowed_roles user_role[] not null default '{admin,creative,ads}',
  add column created_by uuid references profiles(id),
  add column archived_at timestamptz,
  add column created_at timestamptz not null default now();
update channels set slug = 'general', description = 'Announcements and general discussion' where name = 'General';
alter table channels alter column slug set not null;
create unique index channels_slug_idx on channels(slug);

alter table messages add column parent_id uuid references messages(id);
create index messages_channel_idx on messages(channel_id, created_at);
create index messages_parent_idx on messages(parent_id) where parent_id is not null;

create table message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id),
  path text not null,
  mime text not null,
  size_bytes bigint not null,
  name text not null,
  created_at timestamptz not null default now()
);
create index message_attachments_msg_idx on message_attachments(message_id);

create table message_mentions (
  message_id uuid not null references messages(id),
  user_id uuid not null references profiles(id),
  primary key (message_id, user_id)
);

create table channel_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  channel_id uuid not null references channels(id),
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- Access -----------------------------------------------------------------------------
create or replace function public.can_access_channel(p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(exists (
    select 1 from channels c
    where c.id = p_channel and c.archived_at is null and current_role_name() = any (c.allowed_roles)
  ), false)
$$;

alter table message_attachments enable row level security;
alter table message_mentions enable row level security;
alter table channel_reads enable row level security;

drop policy if exists channels_read on channels;
drop policy if exists messages_read on messages;
drop policy if exists messages_insert on messages;

create policy channels_read on channels for select to authenticated using (can_access_channel(id));
create policy messages_read on messages for select to authenticated using (can_access_channel(channel_id));
create policy messages_insert on messages for insert to authenticated
  with check (author_id = auth.uid() and can_access_channel(channel_id));
-- Pin/unpin: admin only (the guard trigger below restricts the update to the `pinned` column).
create policy messages_pin on messages for update to authenticated
  using (is_admin() and can_access_channel(channel_id))
  with check (is_admin() and can_access_channel(channel_id));

create policy mattach_read on message_attachments for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id and can_access_channel(m.channel_id)));
create policy mattach_insert on message_attachments for insert to authenticated
  with check (exists (select 1 from messages m where m.id = message_id and m.author_id = auth.uid()));
create policy mmentions_read on message_mentions for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id and can_access_channel(m.channel_id)));
create policy mmentions_insert on message_mentions for insert to authenticated
  with check (exists (select 1 from messages m where m.id = message_id and m.author_id = auth.uid()));

create policy reads_select on channel_reads for select to authenticated using (user_id = auth.uid());
create policy reads_insert on channel_reads for insert to authenticated
  with check (user_id = auth.uid() and can_access_channel(channel_id));
create policy reads_update on channel_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke delete on messages, message_attachments, message_mentions, channel_reads from authenticated, anon;
revoke update on message_attachments, message_mentions from authenticated, anon;

-- Triggers ---------------------------------------------------------------------------
create or replace function public.guard_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.parent_id is not null then
    select channel_id, parent_id into p from messages where id = new.parent_id;
    if not found or p.channel_id <> new.channel_id then raise exception 'invalid thread parent'; end if;
    if p.parent_id is not null then raise exception 'replies cannot be nested'; end if;
  end if;
  return new;
end $$;
create trigger messages_guard_insert before insert on messages
  for each row execute function guard_message_insert();

create or replace function public.guard_message_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.body is distinct from old.body or new.author_id is distinct from old.author_id
     or new.channel_id is distinct from old.channel_id or new.parent_id is distinct from old.parent_id
     or new.created_at is distinct from old.created_at then
    raise exception 'messages are immutable except pinned';
  end if;
  if new.pinned is distinct from old.pinned and new.parent_id is not null then
    raise exception 'only top-level messages can be pinned';
  end if;
  return new;
end $$;
create trigger messages_guard_update before update on messages
  for each row execute function guard_message_update();

create or replace function public.trg_notify_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_author uuid; slug text;
begin
  if new.parent_id is null then return new; end if;
  select author_id into parent_author from messages where id = new.parent_id;
  select c.slug into slug from channels c where c.id = new.channel_id;
  perform notify(array[parent_author], 'reply', null, new.author_id,
                 jsonb_build_object('channel', slug, 'snippet', left(new.body, 140), 'parent_id', new.parent_id),
                 null, new.id);
  return new;
end $$;
create trigger notify_reply after insert on messages
  for each row execute function trg_notify_reply();

create or replace function public.trg_notify_channel_mention() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record; slug text;
begin
  select channel_id, author_id, body, parent_id into m from messages where id = new.message_id;
  select c.slug into slug from channels c where c.id = m.channel_id;
  delete from notifications where user_id = new.user_id and message_id = new.message_id and type = 'reply';
  perform notify(array[new.user_id], 'channel_mention', null, m.author_id,
                 jsonb_build_object('channel', slug, 'snippet', left(m.body, 140), 'parent_id', m.parent_id),
                 null, new.message_id);
  return new;
end $$;
create trigger notify_channel_mention after insert on message_mentions
  for each row execute function trg_notify_channel_mention();

-- Unread counts per channel for the current user (RLS applies: security invoker).
create or replace function public.channel_unread_counts()
returns table (channel_id uuid, unread int)
language sql stable security invoker as $$
  select c.id, count(m.id)::int
  from channels c
  left join channel_reads r on r.channel_id = c.id and r.user_id = auth.uid()
  left join messages m on m.channel_id = c.id and m.author_id <> auth.uid()
       and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  group by c.id
$$;
grant execute on function public.channel_unread_counts() to authenticated;

-- Storage: allow channel attachments under channels/<channel_id>/...
drop policy if exists storage_insert on storage.objects;
create policy storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'creatives' and (
    current_role_name() in ('admin', 'creative')
    or ((name like 'comments/%' or name like 'channels/%') and current_role_name() is not null)));

alter publication supabase_realtime add table message_attachments;
