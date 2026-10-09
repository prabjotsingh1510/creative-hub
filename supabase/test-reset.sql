-- TEST PROJECT ONLY. Wipes every row so the RLS / e2e suites start clean.
-- Never run this against your real project: it deletes all creatives, comments, history and users' content.
-- (The activity log is append-only, so its triggers are disabled for this one cleanup.)

begin;
alter table activity_log disable trigger activity_log_immutable;

truncate table
  notifications, due_reminders, digest_log, notification_preferences, push_subscriptions, rate_limits,
  message_attachments, message_mentions, channel_reads, messages,
  comment_attachments, mentions, comments,
  activity_log
restart identity cascade;

update creatives set current_version_id = null;
delete from creative_versions;
delete from creatives;

alter table activity_log enable trigger activity_log_immutable;
commit;

-- Also remove test users: Authentication -> Users -> select the @test.local accounts -> Delete,
-- and empty the "creatives" bucket under Storage.
