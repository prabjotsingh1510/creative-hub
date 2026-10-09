-- OPTIONAL (recommended): run the reminder/email tick every 15 minutes from Supabase.
-- Vercel Hobby cron only runs once a day, so this makes reminders and email retries timely.
-- Not a migration because it contains your deployed URL and secret. Paste into the SQL editor
-- ONCE after deploying, replacing the two placeholders. Needs extensions pg_cron + pg_net
-- (Database -> Extensions -> enable both).

select cron.schedule(
  'creative-hub-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To remove: select cron.unschedule('creative-hub-tick');
