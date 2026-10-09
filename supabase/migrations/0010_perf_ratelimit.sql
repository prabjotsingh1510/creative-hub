-- Phase 3 / 0010: performance + rate limiting.

-- creatives_list gains comment_count (appended last so CREATE OR REPLACE VIEW is allowed).
create or replace view creatives_list with (security_invoker = true) as
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
  coalesce((select array_agg(distinct cv.uploaded_by) from creative_versions cv where cv.creative_id = c.id), '{}') as uploader_ids,
  (select count(*)::int from comments cm where cm.creative_id = c.id) as comment_count
from creatives c
left join creative_versions v on v.id = c.current_version_id
cross join lateral (
  select ((c.due_date + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 millisecond' as deadline_at
) d;

-- Keyset pagination for the main list.
create index if not exists creatives_created_keyset_idx on creatives(created_at desc, id desc) where deleted_at is null;

-- Dashboard numbers computed in the database instead of downloading every creative.
create or replace function public.dashboard_stats() returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n)
                           from (select status, count(*) as n from creatives where deleted_at is null group by status) s), '{}'::jsonb),
    'overdue', (select count(*) from creatives_list where deleted_at is null and timing = 'overdue'),
    'live_now', (select count(*) from creatives where deleted_at is null and live_state = 'live'),
    'went_live_7d', (select count(*) from creatives where deleted_at is null and went_live_at >= now() - interval '7 days')
  )
$$;
grant execute on function public.dashboard_stats() to authenticated;

-- Simple fixed-window rate limiter. Key is namespaced per user inside the function.
create table rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);
alter table rate_limits enable row level security;   -- no policies: only the function touches it

create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare k text := p_key || ':' || coalesce(auth.uid()::text, 'anon'); n int;
begin
  insert into rate_limits(key, window_start, count) values (k, now(), 1)
  on conflict (key) do update set
    count = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.count + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning count into n;
  if random() < 0.01 then delete from rate_limits where window_start < now() - interval '1 day'; end if;
  return n <= p_max;
end $$;
revoke execute on function public.check_rate_limit(text, int, int) from public, anon;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;
