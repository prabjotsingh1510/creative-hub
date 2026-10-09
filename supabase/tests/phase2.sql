-- Phase 2 database checks. Paste into the Supabase SQL editor and Run.
-- Needs at least one active user of each role (e.g. from `npm run seed`, or your real users).
-- Everything runs inside a transaction that is ROLLED BACK, so no data is kept.
-- Success: the last message says "PHASE 2 CHECKS PASSED". Any failure raises an exception naming the check.

begin;

create or replace function pg_temp.act_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.back_to_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);   -- auth.uid() back to null (service-level)
end $$;

create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'CHECK FAILED: %', msg; end if;
end $$;

do $$
declare
  a uuid; c uuid; d uuid;           -- admin, creative, ads
  cid uuid; vid uuid; cm uuid; msg uuid; n int; ok boolean; before_cnt int; after_cnt int;
begin
  select id into a from profiles where role = 'admin' and active limit 1;
  select id into c from profiles where role = 'creative' and active limit 1;
  select id into d from profiles where role = 'ads' and active limit 1;
  perform pg_temp.check(a is not null and c is not null and d is not null, 'need one active user per role');

  -- 1. new request notifies the creative team, never the actor
  perform pg_temp.act_as(a);
  insert into creatives(title, due_date, created_by) values ('RLS test creative', current_date + 5, a) returning id into cid;
  perform pg_temp.back_to_admin();
  perform pg_temp.check(exists (select 1 from notifications where user_id = c and creative_id = cid and type = 'request_created'), 'creative notified of new request');
  perform pg_temp.check(not exists (select 1 from notifications where user_id = a and creative_id = cid), 'actor (admin) is never notified of own action');

  -- 2. upload notifies admin + ads (once), not the uploader
  perform pg_temp.act_as(c);
  select id into vid from add_creative_version(cid, cid || '/f.png', null, 'image/png', 1000);
  perform pg_temp.back_to_admin();
  perform pg_temp.check(exists (select 1 from notifications where user_id = a and creative_id = cid and type = 'version_uploaded'), 'admin notified of upload');
  perform pg_temp.check(exists (select 1 from notifications where user_id = d and creative_id = cid and type = 'version_uploaded'), 'ads notified of upload');
  perform pg_temp.check(not exists (select 1 from notifications where user_id = c and creative_id = cid and type = 'version_uploaded'), 'uploader not notified of own upload');
  perform pg_temp.check((select count(*) from notifications where user_id = a and creative_id = cid) = 1, 'no duplicate "submitted" notification after upload');

  -- 3. a mention replaces the generic comment ping
  perform pg_temp.act_as(a);
  insert into comments(creative_id, author_id, body) values (cid, a, 'hello @ads') returning id into cm;
  insert into mentions(comment_id, user_id) values (cm, d);
  perform pg_temp.back_to_admin();
  perform pg_temp.check(exists (select 1 from notifications where user_id = d and comment_id = cm and type = 'mention'), 'mention notification created');
  perform pg_temp.check(not exists (select 1 from notifications where user_id = d and comment_id = cm and type = 'comment'), 'no double comment+mention notification');

  -- 4. status change notifies the next role; field edit is logged old -> new
  perform pg_temp.act_as(a);
  update creatives set status = 'sent_to_ads', due_date = current_date + 9 where id = cid;
  perform pg_temp.back_to_admin();
  perform pg_temp.check(exists (select 1 from notifications where user_id = d and creative_id = cid and type = 'status_changed'), 'ads notified when sent to ads');
  perform pg_temp.check(exists (select 1 from activity_log where creative_id = cid and action = 'field_changed' and meta->>'field' = 'due_date' and from_value is not null and to_value is not null), 'due_date edit logged with old and new value');

  -- 5. ads goes live: went_live_at auto-set, admin + creative notified
  perform pg_temp.act_as(d);
  update creatives set live_state = 'live' where id = cid;
  perform pg_temp.back_to_admin();
  perform pg_temp.check((select went_live_at is not null and status = 'live' from creatives where id = cid), 'went_live_at auto-filled and status synced');
  perform pg_temp.check(exists (select 1 from notifications where user_id = a and creative_id = cid and type = 'live_state_changed'), 'admin notified of live state');
  perform pg_temp.check(exists (select 1 from notifications where user_id = c and creative_id = cid and type = 'live_state_changed'), 'creative notified of live state');

  -- 6. role rules still hold
  perform pg_temp.act_as(c);
  begin
    update creatives set live_state = 'paused' where id = cid;
    ok := false;
  exception when others then ok := true; end;
  perform pg_temp.check(ok, 'creative cannot change live_state');

  -- 7. users only see their own notifications; can't forge or edit them
  select count(*) into n from notifications where user_id <> c;
  perform pg_temp.check(n = 0, 'creative sees only own notifications');
  begin
    insert into notifications(user_id, type) values (c, 'mention'); ok := false;
  exception when others then ok := true; end;
  perform pg_temp.check(ok, 'clients cannot insert notifications');
  begin
    update notifications set type = 'comment' where user_id = c; ok := false;
  exception when others then ok := true; end;
  perform pg_temp.check(ok, 'clients can only change read_at');

  -- 8. activity log is immutable
  begin
    update activity_log set action = 'x' where creative_id = cid; ok := false;
  exception when others then ok := true; end;
  perform pg_temp.check(ok, 'activity_log update rejected');
  begin
    delete from activity_log where creative_id = cid; ok := false;
  exception when others then ok := true; end;
  perform pg_temp.check(ok, 'activity_log delete rejected');
  perform pg_temp.back_to_admin();
  begin
    update activity_log set action = 'x' where creative_id = cid; ok := false;
  exception when others then ok := true; end;
  perform pg_temp.check(ok, 'activity_log update rejected even for the table owner');

  -- 9. General channel: only admin can pin
  perform pg_temp.act_as(c);
  insert into messages(channel_id, author_id, body) select id, c, 'hi team' from channels where slug = 'general' returning id into msg;
  update messages set pinned = true where id = msg;
  perform pg_temp.check(not (select pinned from messages where id = msg), 'non-admin pin has no effect');
  perform pg_temp.act_as(a);
  update messages set pinned = true where id = msg;
  perform pg_temp.check((select pinned from messages where id = msg), 'admin can pin');
  perform pg_temp.back_to_admin();

  -- 10. reminders fire once per (creative, kind, due_date)
  update creatives set due_date = (now() at time zone 'Asia/Kolkata')::date, submitted_at = null, current_version_id = null where id = cid;
  select count(*) into before_cnt from due_reminders;
  perform generate_due_reminders();
  select count(*) into after_cnt from due_reminders;
  perform pg_temp.check(after_cnt > before_cnt, 'due_soon reminder created');
  perform generate_due_reminders();
  perform pg_temp.check((select count(*) from due_reminders) = after_cnt, 'second run creates no duplicate reminders');
  perform pg_temp.check((select count(*) from notifications where user_id = c and creative_id = cid and type = 'due_soon') = 1, 'exactly one due_soon notification');

  -- 11. deleted creatives' activity is hidden from non-admins
  perform pg_temp.act_as(a);
  update creatives set deleted_at = now() where id = cid;
  perform pg_temp.act_as(c);
  select count(*) into n from activity_log where creative_id = cid;
  perform pg_temp.check(n = 0, 'non-admin cannot read activity of deleted creative');
  perform pg_temp.act_as(a);
  select count(*) into n from activity_log where creative_id = cid;
  perform pg_temp.check(n > 0, 'admin still sees activity of deleted creative');
  perform pg_temp.back_to_admin();

  raise notice 'PHASE 2 CHECKS PASSED';
end $$;

rollback;
