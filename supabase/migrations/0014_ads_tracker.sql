-- Phase 4 / 0014: Ads Tracker tab (mirrors the "CreativeTracker_Dabble - Ads Tracker" sheet).
--  * creatives gains the sheet's tracker columns (admin + ads may edit; creative role may not)
--  * meta_status_changed_at is stamped whenever live_state changes
--  * tracker_list view = creatives + current-file thumbnail + stable serial number (S.NO.)
-- Existing sheet columns already covered: Asset Name = title, Campaign = campaign, Media Type = format,
-- Asset Shared Date = submitted_at, Meta Ads Link = meta_preview_link, Go-live Date = went_live_at,
-- Live Status = is_live, Current Status on Meta = live_state, Last Edited Date = updated_at.

alter table creatives
  add column if not exists product_advertised text,
  add column if not exists platform text not null default 'Meta',
  add column if not exists asset_type text check (asset_type in ('inhouse', 'parent')),
  add column if not exists creator_name text,
  add column if not exists instagram_handle text,
  add column if not exists ad_name text,
  add column if not exists meta_campaign_name text,
  add column if not exists ad_set_name text,
  add column if not exists partnership_ad boolean,
  add column if not exists language text,
  add column if not exists face_in_first_3s boolean,
  add column if not exists audio_hook_first_3s boolean,
  add column if not exists text_in_first_3s boolean,
  add column if not exists caption text,
  add column if not exists landing_page_url text,
  add column if not exists landing_page_type text,
  add column if not exists cta_used text,
  add column if not exists tracker_comments text,
  add column if not exists pause_reason text,
  add column if not exists meta_status_changed_at timestamptz;

create or replace function public.guard_creative_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare r user_role := current_role_name();
begin
  if auth.uid() is null then return new; end if;   -- service role / internal
  -- add_creative_version() (security definer) raises this flag for its own update, so the
  -- creative role can upload: the function itself enforces who may upload.
  if current_setting('app.upload_in_progress', true) = '1' then r := 'admin'; end if;
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
       or new.product_advertised is distinct from old.product_advertised
       or new.platform is distinct from old.platform
       or new.asset_type is distinct from old.asset_type
       or new.creator_name is distinct from old.creator_name
       or new.instagram_handle is distinct from old.instagram_handle
       or new.ad_name is distinct from old.ad_name
       or new.meta_campaign_name is distinct from old.meta_campaign_name
       or new.ad_set_name is distinct from old.ad_set_name
       or new.partnership_ad is distinct from old.partnership_ad
       or new.language is distinct from old.language
       or new.face_in_first_3s is distinct from old.face_in_first_3s
       or new.audio_hook_first_3s is distinct from old.audio_hook_first_3s
       or new.text_in_first_3s is distinct from old.text_in_first_3s
       or new.caption is distinct from old.caption
       or new.landing_page_url is distinct from old.landing_page_url
       or new.landing_page_type is distinct from old.landing_page_type
       or new.cta_used is distinct from old.cta_used
       or new.tracker_comments is distinct from old.tracker_comments
       or new.pause_reason is distinct from old.pause_reason
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
    if old.status not in ('approved', 'sent_to_ads', 'live', 'paused', 'rejected')
       and (new.status is distinct from old.status or new.live_state is distinct from old.live_state) then
      raise exception 'ads can only act on creatives that are approved or sent to ads';
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
    new.meta_status_changed_at := now();
    if new.live_state = 'live' and new.went_live_at is null then new.went_live_at := now(); end if;
    if new.live_state = 'live' then new.status := 'live';
    elsif new.live_state = 'paused' then new.status := 'paused';
    elsif new.live_state = 'rejected' then new.status := 'rejected';
    elsif old.status in ('live','paused','rejected') then new.status := 'sent_to_ads'; end if;
    perform log_activity(new.id, 'live_state_changed', old.live_state::text, new.live_state::text);
  end if;

  if new.status is distinct from old.status then
    if new.status = 'submitted' and new.current_version_id is null then
      raise exception 'upload a file before submitting';
    end if;
    if new.live_state is not distinct from old.live_state then
      if r = 'creative' and not (old.status in ('requested','changes_requested') and new.status = 'submitted') then
        raise exception 'creative role cannot move % -> %', old.status, new.status;
      end if;
      if r = 'ads' and not (
           new.status in ('live', 'paused', 'rejected')
           or (old.status in ('approved', 'sent_to_ads') and new.status = 'changes_requested')) then
        raise exception 'ads role cannot move % -> %', old.status, new.status;
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
  if new.ad_name is distinct from old.ad_name then perform log_field_change(new.id, 'ad_name', old.ad_name, new.ad_name); end if;
  if new.meta_campaign_name is distinct from old.meta_campaign_name then perform log_field_change(new.id, 'meta_campaign_name', old.meta_campaign_name, new.meta_campaign_name); end if;
  if new.ad_set_name is distinct from old.ad_set_name then perform log_field_change(new.id, 'ad_set_name', old.ad_set_name, new.ad_set_name); end if;
  if new.product_advertised is distinct from old.product_advertised then perform log_field_change(new.id, 'product_advertised', old.product_advertised, new.product_advertised); end if;
  if new.landing_page_url is distinct from old.landing_page_url then perform log_field_change(new.id, 'landing_page_url', old.landing_page_url, new.landing_page_url); end if;
  if new.pause_reason is distinct from old.pause_reason then perform log_field_change(new.id, 'pause_reason', old.pause_reason, new.pause_reason); end if;
  return new;
end $$;

-- Tracker rows: one per creative, newest update first is a query-side ORDER BY (updated_at desc).
create or replace view tracker_list with (security_invoker = true) as
select
  c.*,
  row_number() over (order by c.created_at, c.id) as sno,
  v.thumb_path,
  v.file_path,
  v.mime,
  v.version_no
from creatives c
left join creative_versions v on v.id = c.current_version_id;
grant select on tracker_list to authenticated;

create index if not exists creatives_updated_idx on creatives(updated_at desc, id desc) where deleted_at is null;
