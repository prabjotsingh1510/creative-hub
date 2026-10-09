-- Phase 2 / 0007: search + filter support for the creatives list.

create extension if not exists pg_trgm;

create index creatives_title_trgm on creatives using gin (title gin_trgm_ops);
create index creatives_campaign_trgm on creatives using gin (campaign gin_trgm_ops);
create index creatives_brief_trgm on creatives using gin (brief gin_trgm_ops);
create index creatives_copy_trgm on creatives using gin (copy_notes gin_trgm_ops);
create index creatives_adsnotes_trgm on creatives using gin (ads_notes gin_trgm_ops);
create index comments_body_trgm on comments using gin (body gin_trgm_ops);

create index creatives_live_state_idx on creatives(live_state) where deleted_at is null;
create index creatives_went_live_idx on creatives(went_live_at desc) where deleted_at is null;
create index creatives_updated_idx on creatives(updated_at desc) where deleted_at is null;
create index creatives_format_idx on creatives(format) where deleted_at is null;
create index creatives_campaign_idx on creatives(campaign) where deleted_at is null;
create index creatives_submitted_idx on creatives(submitted_at) where deleted_at is null;
create index creative_versions_uploader_idx on creative_versions(uploaded_by);

-- One row per creative with derived timing + current file, so the list can filter/sort in SQL.
-- security_invoker: the caller's RLS on creatives / creative_versions applies.
create view creatives_list with (security_invoker = true) as
select
  c.*,
  d.deadline_at,
  case
    when c.due_date is null then 'none'
    when c.submitted_at is not null then case when c.submitted_at <= d.deadline_at then 'on_time' else 'late' end
    when now() > d.deadline_at then 'overdue'
    else 'pending'
  end as timing,
  v.uploaded_by as current_uploader,
  v.thumb_path,
  v.file_path,
  v.mime,
  v.version_no,
  coalesce((select array_agg(distinct cv.uploaded_by) from creative_versions cv where cv.creative_id = c.id), '{}') as uploader_ids
from creatives c
left join creative_versions v on v.id = c.current_version_id
cross join lateral (
  select ((c.due_date + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 millisecond' as deadline_at
) d;
grant select on creatives_list to authenticated;

-- Substring search over title, campaign, brief, notes and comment text (case-insensitive).
create or replace function public.search_creative_ids(q text) returns setof uuid
language sql stable security invoker as $$
  with p as (select '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat)
  select id from (
    select c.id from creatives c, p
     where c.title ilike p.pat or c.campaign ilike p.pat or c.brief ilike p.pat
        or c.copy_notes ilike p.pat or c.ads_notes ilike p.pat
    union
    select cm.creative_id from comments cm, p where cm.body ilike p.pat
  ) s
  limit 500
$$;
grant execute on function public.search_creative_ids(text) to authenticated;
