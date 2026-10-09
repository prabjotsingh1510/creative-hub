alter table profiles enable row level security;
alter table creatives enable row level security;
alter table creative_versions enable row level security;
alter table comments enable row level security;
alter table comment_attachments enable row level security;
alter table mentions enable row level security;
alter table notifications enable row level security;
alter table channels enable row level security;
alter table messages enable row level security;
alter table activity_log enable row level security;

-- profiles
create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

-- creatives: everyone active sees non-deleted; admin also sees deleted. No DELETE policy.
create policy creatives_read on creatives for select to authenticated
  using (current_role_name() is not null and (deleted_at is null or is_admin()));
create policy creatives_insert on creatives for insert to authenticated
  with check (is_admin() and created_by = auth.uid());
create policy creatives_update on creatives for update to authenticated
  using (current_role_name() is not null and (deleted_at is null or is_admin()))
  with check (current_role_name() is not null);

-- versions: read for all; inserts only through add_creative_version() (security definer)
create policy versions_read on creative_versions for select to authenticated
  using (current_role_name() is not null);

-- comments (any active role may comment; only `pinned` is mutable, see trigger)
create policy comments_read on comments for select to authenticated
  using (current_role_name() is not null);
create policy comments_insert on comments for insert to authenticated
  with check (current_role_name() is not null and author_id = auth.uid());
create policy comments_pin on comments for update to authenticated
  using (current_role_name() is not null) with check (current_role_name() is not null);

create policy cattach_read on comment_attachments for select to authenticated
  using (current_role_name() is not null);
create policy cattach_insert on comment_attachments for insert to authenticated
  with check (exists (select 1 from comments c where c.id = comment_id and c.author_id = auth.uid()));

create policy mentions_read on mentions for select to authenticated using (current_role_name() is not null);
create policy mentions_insert on mentions for insert to authenticated
  with check (exists (select 1 from comments c where c.id = comment_id and c.author_id = auth.uid()));

-- notifications: own only
create policy notif_read on notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- general channel
create policy channels_read on channels for select to authenticated using (current_role_name() is not null);
create policy messages_read on messages for select to authenticated using (current_role_name() is not null);
create policy messages_insert on messages for insert to authenticated
  with check (current_role_name() is not null and author_id = auth.uid());

-- activity log: read-only for clients (written by security-definer functions)
create policy activity_read on activity_log for select to authenticated
  using (current_role_name() is not null);

revoke insert, update, delete on activity_log from authenticated, anon;
revoke insert, update, delete on creative_versions from authenticated, anon;
revoke delete on all tables in schema public from authenticated, anon;
grant execute on function public.add_creative_version(uuid, text, text, text, bigint) to authenticated;

-- Realtime
alter publication supabase_realtime add table comments, messages, notifications, creatives, activity_log;

-- Storage: private bucket, path = <creative_id>/<file> or comments/<creative_id>/<file>
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('creatives', 'creatives', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm','application/pdf'])
on conflict (id) do nothing;

create policy storage_read on storage.objects for select to authenticated
  using (bucket_id = 'creatives' and current_role_name() is not null);
create policy storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'creatives' and (
    current_role_name() in ('admin','creative')
    or (name like 'comments/%' and current_role_name() is not null)));
-- no update/delete policies: files are never removed by clients
