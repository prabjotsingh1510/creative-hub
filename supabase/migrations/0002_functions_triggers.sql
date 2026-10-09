-- Helpers -------------------------------------------------------------------
create or replace function public.current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name() = 'admin', false)
$$;

-- New auth user -> profile (role/name/team come from invite metadata) --------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, name, role, team)
  values (
    new.id, coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'creative'),
    new.raw_user_meta_data->>'team'
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Activity log is append-only -------------------------------------------------
create or replace function public.block_activity_mutation() returns trigger
language plpgsql as $$
begin raise exception 'activity_log is immutable'; end $$;
create trigger activity_log_immutable before update or delete on activity_log
  for each row execute function block_activity_mutation();

create or replace function public.log_activity(
  p_creative uuid, p_action text, p_from text default null, p_to text default null, p_meta jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into activity_log(creative_id, actor_id, action, from_value, to_value, meta)
  values (p_creative, auth.uid(), p_action, p_from, p_to, coalesce(p_meta, '{}'));
$$;
-- Not callable by clients; only by triggers / security definer functions.
revoke execute on function public.log_activity(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Profiles: only admin may change role/active/email --------------------------
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.role <> old.role or new.active <> old.active or new.email <> old.email then
      raise exception 'only admin can change role/active/email';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles
  for each row execute function guard_profile_update();

-- Creatives: column-level permissions + status transition rules --------------
create or replace function public.guard_creative_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare r user_role := current_role_name();
begin
  if auth.uid() is null then return new; end if;   -- service role / internal
  new.updated_at := now();
  if r = 'admin' then
    null;
  elsif r = 'creative' then
    if new.live_state is distinct from old.live_state
       or new.went_live_at is distinct from old.went_live_at
       or new.meta_preview_link is distinct from old.meta_preview_link
       or new.ads_notes is distinct from old.ads_notes
       or new.due_date is distinct from old.due_date
       or new.brief is distinct from old.brief
       or new.reference_links is distinct from old.reference_links
       or new.submitted_at is distinct from old.submitted_at
       or new.current_version_id is distinct from old.current_version_id
       or new.deleted_at is distinct from old.deleted_at
       or new.created_by is distinct from old.created_by then
      raise exception 'creative role cannot edit these fields';
    end if;
  elsif r = 'ads' then
    if new.title is distinct from old.title or new.campaign is distinct from old.campaign
       or new.format is distinct from old.format or new.brief is distinct from old.brief
       or new.reference_links is distinct from old.reference_links
       or new.due_date is distinct from old.due_date
       or new.submitted_at is distinct from old.submitted_at
       or new.drive_link is distinct from old.drive_link
       or new.copy_notes is distinct from old.copy_notes
       or new.current_version_id is distinct from old.current_version_id
       or new.deleted_at is distinct from old.deleted_at
       or new.created_by is distinct from old.created_by then
      raise exception 'ads role cannot edit these fields';
    end if;
  else
    raise exception 'not allowed';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    new.deleted_by := case when new.deleted_at is null then null else auth.uid() end;
    perform log_activity(new.id, case when new.deleted_at is null then 'restored' else 'deleted' end);
  end if;

  -- live_state drives status for live/paused/rejected
  if new.live_state is distinct from old.live_state then
    if new.live_state = 'live' and new.went_live_at is null then new.went_live_at := now(); end if;
    if new.live_state = 'live' then new.status := 'live';
    elsif new.live_state = 'paused' then new.status := 'paused';
    elsif new.live_state = 'rejected' then new.status := 'rejected';
    elsif old.status in ('live','paused','rejected') then new.status := 'sent_to_ads'; end if;
    perform log_activity(new.id, 'live_state_changed', old.live_state::text, new.live_state::text);
  end if;

  if new.status is distinct from old.status then
    if new.live_state is not distinct from old.live_state then
      -- manual status change (not derived from live_state)
      if r = 'creative' and not (old.status in ('requested','changes_requested') and new.status = 'submitted') then
        raise exception 'creative role cannot move % -> %', old.status, new.status;
      end if;
      if r = 'ads' and new.status not in ('changes_requested','live','paused','rejected') then
        raise exception 'ads role cannot move to %', new.status;
      end if;
    end if;
    perform log_activity(new.id, 'status_changed', old.status::text, new.status::text);
  end if;
  return new;
end $$;
create trigger creatives_guard before update on creatives
  for each row execute function guard_creative_update();

create or replace function public.log_creative_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_activity(new.id, 'created', null, new.status::text);
  return new;
end $$;
create trigger creatives_after_insert after insert on creatives
  for each row execute function log_creative_insert();

-- Upload a new version: assigns version_no, sets current, submitted_at, status --
create or replace function public.add_creative_version(
  p_creative uuid, p_file_path text, p_thumb_path text, p_mime text, p_size bigint
) returns creative_versions
language plpgsql security definer set search_path = public as $$
declare r user_role := current_role_name(); v creative_versions; n int;
begin
  if r not in ('admin','creative') then raise exception 'not allowed to upload'; end if;
  perform 1 from creatives where id = p_creative and deleted_at is null for update;
  if not found then raise exception 'creative not found'; end if;
  select coalesce(max(version_no),0)+1 into n from creative_versions where creative_id = p_creative;
  insert into creative_versions(creative_id, version_no, file_path, thumb_path, mime, size_bytes, uploaded_by)
  values (p_creative, n, p_file_path, p_thumb_path, p_mime, p_size, auth.uid()) returning * into v;
  update creatives set
    current_version_id = v.id,
    submitted_at = coalesce(submitted_at, now()),
    status = case when status in ('requested','changes_requested') then 'submitted'::creative_status else status end,
    updated_at = now()
  where id = p_creative;
  perform log_activity(p_creative, 'version_uploaded', null, 'v' || n, jsonb_build_object('version_id', v.id));
  return v;
end $$;

-- Comment side effects --------------------------------------------------------
create or replace function public.log_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_activity(new.creative_id, 'comment', null, null, jsonb_build_object('comment_id', new.id));
  return new;
end $$;
create trigger comments_after_insert after insert on comments
  for each row execute function log_comment();

-- Only the pinned flag may change on a comment
create or replace function public.guard_comment_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.body is distinct from old.body or new.author_id is distinct from old.author_id
     or new.creative_id is distinct from old.creative_id or new.version_id is distinct from old.version_id then
    raise exception 'comments are immutable except pinned';
  end if;
  return new;
end $$;
create trigger comments_guard before update on comments
  for each row execute function guard_comment_update();
