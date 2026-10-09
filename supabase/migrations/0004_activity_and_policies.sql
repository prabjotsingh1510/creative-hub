-- Phase 2 / 0004: richer activity log (field edits, pins) + tighter activity read policy.
-- Run after 0001-0003. Uses CREATE OR REPLACE so Phase 1 objects are extended, not recreated.

-- Field-edit logging helper (security definer: clients cannot call log_activity directly) ----
create or replace function public.log_field_change(p_creative uuid, p_field text, p_old text, p_new text)
returns void language sql security definer set search_path = public as $$
  insert into activity_log(creative_id, actor_id, action, from_value, to_value, meta)
  values (p_creative, auth.uid(), 'field_changed', left(p_old, 500), left(p_new, 500),
          jsonb_build_object('field', p_field));
$$;
revoke execute on function public.log_field_change(uuid, text, text, text) from public, anon, authenticated;

-- Creatives guard: same rules as Phase 1 + field_changed logging -------------------------------
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
      if r = 'creative' and not (old.status in ('requested','changes_requested') and new.status = 'submitted') then
        raise exception 'creative role cannot move % -> %', old.status, new.status;
      end if;
      if r = 'ads' and new.status not in ('changes_requested','live','paused','rejected') then
        raise exception 'ads role cannot move to %', new.status;
      end if;
    end if;
    perform log_activity(new.id, 'status_changed', old.status::text, new.status::text);
  end if;

  -- field edits (old -> new)
  if new.title is distinct from old.title then perform log_field_change(new.id, 'title', old.title, new.title); end if;
  if new.campaign is distinct from old.campaign then perform log_field_change(new.id, 'campaign', old.campaign, new.campaign); end if;
  if new.format is distinct from old.format then perform log_field_change(new.id, 'format', old.format::text, new.format::text); end if;
  if new.brief is distinct from old.brief then perform log_field_change(new.id, 'brief', old.brief, new.brief); end if;
  if new.due_date is distinct from old.due_date then perform log_field_change(new.id, 'due_date', old.due_date::text, new.due_date::text); end if;
  if new.drive_link is distinct from old.drive_link then perform log_field_change(new.id, 'drive_link', old.drive_link, new.drive_link); end if;
  if new.copy_notes is distinct from old.copy_notes then perform log_field_change(new.id, 'copy_notes', old.copy_notes, new.copy_notes); end if;
  if new.meta_preview_link is distinct from old.meta_preview_link then perform log_field_change(new.id, 'meta_preview_link', old.meta_preview_link, new.meta_preview_link); end if;
  if new.ads_notes is distinct from old.ads_notes then perform log_field_change(new.id, 'ads_notes', old.ads_notes, new.ads_notes); end if;
  if new.went_live_at is distinct from old.went_live_at and old.went_live_at is not null then perform log_field_change(new.id, 'went_live_at', old.went_live_at::text, new.went_live_at::text); end if;
  if new.submitted_at is distinct from old.submitted_at and old.submitted_at is not null then
    perform log_field_change(new.id, 'submitted_at', old.submitted_at::text, new.submitted_at::text);
  end if;
  return new;
end $$;

-- Comment guard: only `pinned` may change; log pin/unpin ----------------------------------------
create or replace function public.guard_comment_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.body is distinct from old.body or new.author_id is distinct from old.author_id
     or new.creative_id is distinct from old.creative_id or new.version_id is distinct from old.version_id then
    raise exception 'comments are immutable except pinned';
  end if;
  if new.pinned is distinct from old.pinned then
    perform log_activity(new.creative_id, case when new.pinned then 'pinned' else 'unpinned' end,
                         null, null, jsonb_build_object('comment_id', new.id));
  end if;
  return new;
end $$;

-- Activity log: follows creatives visibility (hides deleted creatives from non-admins) ----------
drop policy if exists activity_read on activity_log;
create policy activity_read on activity_log for select to authenticated
  using (current_role_name() is not null
         and exists (select 1 from creatives c where c.id = activity_log.creative_id));
-- No INSERT/UPDATE/DELETE policy exists for any client role; writes happen only through
-- security-definer functions, and the immutability trigger blocks UPDATE/DELETE for everyone.
revoke truncate on activity_log from authenticated, anon;

create index if not exists activity_created_idx on activity_log(created_at desc);
create index if not exists activity_actor_idx on activity_log(actor_id, created_at desc);
create index if not exists activity_action_idx on activity_log(action);
