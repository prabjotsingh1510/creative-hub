# Creative Hub

One source of truth for Meta ad creatives: versions, discussion, dates and live status. See [CLAUDE.md](CLAUDE.md) for architecture and conventions.

**Status: Phase 2** – on top of Phase 1 (auth/roles/RLS, creatives, versions, comments): dashboard, filters + search + sort (URL-based), in-app + email notifications with preferences, due-date reminders, full activity timeline + admin activity page, and a realtime General channel.

## Setup

1. **Create a Supabase project** (supabase.com). Free tier is fine (50 MB file cap).
2. **Run the migrations** in order in the Supabase SQL editor (or `supabase db push` with the CLI):
   `0001_schema.sql`, `0002_functions_triggers.sql`, `0003_rls_storage.sql` (Phase 1), then `0004_activity_and_policies.sql`, `0005_notifications.sql`, `0006_channels.sql`, `0007_search_filters.sql` (Phase 2). Run each file once, in order, in `supabase/migrations/`.
3. **Auth settings**: turn OFF "Allow new users to sign up" (Authentication → Sign In / Providers) – roles come from invite metadata, so open sign-up would let anyone pick a role. Then (Authentication → URL Configuration): set Site URL to your app URL and add `<app>/auth/confirm` to redirect URLs.
   The default invite email works as-is (links land on `/set-password`), so no template editing is needed. Also add `<app>/set-password` to the redirect URLs.
4. **Env vars**: `cp .env.example .env.local` and fill in URL, anon key, service-role key (Project settings → API). The service-role key is server-only.
5. **First admin**: create Prabjot in Authentication → Users (Add user, auto-confirm), then in SQL:
   `update profiles set role = 'admin', name = 'Prabjot' where email = '<his email>';`
   After that, invite everyone else from **Users** in the app.
6. `npm install && npm run dev` → http://localhost:3000

### Demo data (optional, non-production only)
`npm run seed` creates `prabjot@demo.test` (admin), `creative@demo.test`, `rajat@demo.test` (password `demo-password-123`) and 3 sample requests. It refuses to run against a hosted `*.supabase.co` project unless `SEED_ALLOW_REMOTE=1`, because the passwords are public – delete those users afterwards.

## Testing
`npm run check` runs lint, typecheck and unit tests (permissions, IST/lateness logic, validators).

Manual walkthrough: log in as admin → New request → log in as creative → Upload creative (status becomes Submitted, submission date auto-set, on-time/late shown) → upload a second file (v2) → comment with an @mention in two browsers (realtime) → admin: Approved → Sent to ads → ads user: set Live (went-live time auto-fills, editable).
Permission checks: the creative user can't see editable DP fields; calls that try anyway are rejected by the database.

## Deploy (Vercel)
Import the repo, set the four env vars from `.env.example` (`NEXT_PUBLIC_SITE_URL` = production URL), deploy. Update Supabase Site URL/redirects to the production URL.

## Limits
Images ≤ 10 MB (JPG/PNG/WebP/GIF), videos ≤ 50 MB (MP4/MOV/WebM). For larger videos upload a compressed preview and paste the original in the Drive link.

## Roadmap
Phase 2: dashboard, filters/search, notifications + email, due-date reminders, General channel. Phase 3: Kanban, polish, e2e tests.

## Phase 2 setup

### New environment variables
| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key. Empty = emails are skipped and logged (fine for local dev). |
| `EMAIL_FROM` | Sender, e.g. `Creative Hub <notifications@yourdomain.com>`. Needs a domain verified in Resend; without one Resend only delivers to your own account email. |
| `CRON_SECRET` | Bearer token protecting `/api/cron/reminders`. Required – the endpoint rejects everything if unset. |

Add the same three (plus the four from Phase 1) in Vercel → Project → Settings → Environment Variables. Vercel automatically sends `CRON_SECRET` as `Authorization: Bearer …` to its own cron.

### Email (Resend)
1. Sign up at resend.com → Domains → add your domain and add the DNS records they show → wait for "Verified".
2. API Keys → create a key → `RESEND_API_KEY`. Set `EMAIL_FROM` to an address on that domain.
3. Each user chooses their own email events at **Settings (gear icon) → Notification settings**. In-app notifications are always on. You are never emailed about your own actions.

### Scheduler (reminders, email retries, daily digest)
One idempotent endpoint does all of it: `GET /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET`.
- **Recommended:** Supabase `pg_cron` every 15 min (free, timely). Enable the `pg_cron` and `pg_net` extensions, then paste `supabase/optional/pg_cron.sql` (fill in your URL and secret).
- **Backup:** `vercel.json` runs it once a day (03:30 UTC = 09:00 IST). Vercel Hobby only allows daily cron, so on its own reminders could be up to a day late; the 15-minute job fixes that.
- Notification emails are also sent right after each action, so mentions don't wait for the scheduler.

Reminder rules: "due today" fires from 00:00 IST on the due date, "overdue" after 23:59:59 IST, only while nothing has been submitted, once each per due date (changing the due date re-arms them).

### Trigger a reminder manually (local)
1. Set `CRON_SECRET=test-secret` in `.env.local`, restart `npm run dev`.
2. As admin set a creative's due date to today (or yesterday) with no upload.
3. Run:
   ```bash
   curl -H "Authorization: Bearer test-secret" http://localhost:3000/api/cron/reminders
   ```
   Response like `{"reminders":1,"emails":{...},"digests":{...}}`. Run it again: `reminders` is `0` (no duplicates). A wrong or missing token returns 401. The creative-team users get a bell notification.

### Testing Phase 2
- `npm run check` – lint, typecheck, unit tests (filters, deep links, templates, IST logic).
- `supabase/tests/phase2.sql` – paste into the SQL editor; checks notification triggers, de-duplication, RLS, immutability, reminders. Runs in a transaction and rolls back; ends with `PHASE 2 CHECKS PASSED`. Needs one user per role.
- `npm run seed` also adds sample notifications, activity and General messages (non-production only, see above).

### Where things are
Dashboard `/dashboard` · Creatives `/creatives` (filters in the URL) · Notifications `/notifications` · Settings `/settings/notifications` · General `/channels/general` · Admin activity `/admin/activity`.
