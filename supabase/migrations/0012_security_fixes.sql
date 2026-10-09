-- Phase 3 / 0012: findings from the security review (see docs/SECURITY.md).

-- 1) The team directory (names, emails, roles) was readable by any signed-in user, including a
--    deactivated user whose session had not expired yet. Active roles still see everyone;
--    a deactivated user can only read their own row (needed to show "account deactivated").
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated
  using (current_role_name() is not null or id = auth.uid());

-- 2) check_rate_limit() is callable by any signed-in user, so reject arbitrary keys that could be
--    used to bloat the rate_limits table. Only short lowercase names are accepted.
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare k text; n int;
begin
  if p_key is null or p_key !~ '^[a-z_]{1,24}$' or p_max < 1 or p_max > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit parameters';
  end if;
  k := p_key || ':' || coalesce(auth.uid()::text, 'anon');
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
