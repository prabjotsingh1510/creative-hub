# Creative Hub

One source of truth for Meta ad creatives: versions, discussion, dates and live status. See [CLAUDE.md](CLAUDE.md) for architecture and conventions.

**Status: Phase 3 (Kanban, mobile/PWA, performance, tests, hardening)** on top of Phase 2 – on top of Phase 1 (auth/roles/RLS, creatives, versions, comments): dashboard, filters + search + sort (URL-based), in-app + email notifications with preferences, due-date reminders, full activity timeline + admin activity page, and a realtime General channel.

## Setup

1. **Create a Supabase project** (supabase.com). Free tier is fine (50 MB file cap).
2. **Run the migrations** in order in the Supabase SQL editor (or `supabase db push` with the CLI):
   `0001_schema.sql`, `0002_functions_triggers.sql`, `0003_rls_storage.sql` (Phase 1), then `0004_activity_and_policies.sql`, `0005_notifications.sql`, `0006_channels.sql`, `0007_search_filters.sql`, `0008_fix_creative_upload.sql` (Phase 2; 0008 fixes creative-role uploads), then Phase 3: `0009_workflow_rules.sql`, `0010_perf_ratelimit.sql`, `0011_push.sql`, `0012_security_fixes.sql` (see below). Run each file once, in order, in `supabase/migrations/`.
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

## Phase 3

### New migrations (run in order, once each; test project first)
| File | What it does |
|---|---|
| `0009_workflow_rules.sql` | **Behaviour change.** Ads can change status/live state only on creatives already sent to ads; "request changes" only from Sent to ads; nothing moves to Submitted without an uploaded file. |
| `0010_perf_ratelimit.sql` | `comment_count` on `creatives_list`, keyset index, `dashboard_stats()`, rate-limit table + function. |
| `0011_push.sql` | Optional Web Push tables/columns (does nothing until a device subscribes). |
| `0012_security_fixes.sql` | Deactivated users can't read the directory; rate-limit key validation. |

### Workflow rules (enforced in the database and the UI)
| Role | Allowed status moves |
|---|---|
| creative | Requested / Changes requested -> Submitted (needs a file; uploading does this automatically) |
| ads | only once Sent to ads: -> Live (asks for went-live time + Meta preview link), Paused, Rejected, or "Changes requested" from Sent to ads |
| admin | anything (still not to Submitted without a file) |

### Board (Kanban) view
Creatives -> board icon. Desktop: drag by the grip handle. Phones and keyboards: the "Move to..." menu on each card (phones also get a column switcher). Disallowed moves are refused with a reason; moving to Live opens the go-live dialog. Filters and search apply to the board.

### Install as an app (PWA)
Chrome/Edge/Android: account menu -> **Install app**. iPhone/iPad: Safari -> Share -> **Add to Home Screen**. An offline page appears when there is no connection (no private data is cached).

### Web push (optional)
1. `npx web-push generate-vapid-keys`
2. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@yourdomain.com` (Vercel + `.env.local`) and run migration 0011.
3. Each person turns it on under **Settings -> Notification settings** on each device.
Limits: iPhone/iPad only works after the app is added to the Home Screen (iOS 16.4+) and opened from there; some Android battery savers delay pushes; the daily cron or the 15-minute job retries failures.

### Error reporting (optional)
Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` to turn on Sentry. Without them nothing is loaded or sent.

### Testing
| Command | What |
|---|---|
| `npm run check` | lint + typecheck + unit tests (offline) |
| `npm run test:coverage` | unit tests with coverage (`src/lib`) |
| `npm run test:rls` | **RLS integration suite** against a real test project (skipped without `.env.test`) |
| `npm run test:e2e` | Playwright: admin -> creative -> approve -> ads live, mobile checks, axe accessibility |
| `npm run lighthouse` | mobile Lighthouse on a production build |

**Test project setup (one time):** create a second free Supabase project, run migrations `0001`-`0012` in it, add the three keys to `creative-hub/.env.test`:
```
TEST_SUPABASE_URL=https://xxxx.supabase.co
TEST_SUPABASE_ANON_KEY=...
TEST_SUPABASE_SERVICE_ROLE_KEY=...
```
Turn off "Confirm email" is not needed (users are created pre-confirmed). Never point these at your real project. `supabase/test-reset.sql` wipes a test project between runs. First e2e run: `npx playwright install chromium`.

### CI
`.github/workflows/ci.yml` runs lint, typecheck, unit tests + coverage and a build on every push. The RLS and e2e jobs run only when you add the three test secrets as repository secrets **and** a repository variable `RUN_DB_TESTS=true`. CI has not been executed yet (no GitHub remote); push the repo to GitHub to start it.

### Backups and recovery
- **Database:** Supabase Free has no downloadable daily backups or point-in-time recovery; Pro keeps daily backups (7 days) and offers PITR as an add-on. On Free, take your own: `npx supabase db dump --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" -f backup.sql` (and `--data-only` for data), weekly at least. Keep copies outside Supabase.
- **Files:** the `creatives` bucket is not in database backups. Copy it periodically (Storage -> download, or `rclone`/S3-compatible access from Project Settings -> Storage). Originals should also live in the Drive links.
- **Restore:** create a new Supabase project, run the migrations `0001`-`0012`, then load the data dump, re-upload files, update the three env vars, and re-add the auth users (the dump of `auth.users` is included in a full `db dump`).
- **Accidental deletes:** creatives are soft-deleted; admin -> Creatives -> Deleted -> Restore. The activity log can never be edited.

### Production deployment checklist
1. Supabase: run migrations `0001`-`0012`; Authentication: **sign-ups off**, Site URL + `/set-password` redirect set to the production URL; consider enabling CAPTCHA / Attack Protection.
2. Create the first admin (SQL in Setup step 5) and invite the team from **Users**.
3. Vercel: import the repo; env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (production URL), `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`; optional `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.
4. Resend: verify your domain; send a test mention.
5. Scheduler: paste `supabase/optional/pg_cron.sql` (15-minute job); Vercel's daily cron in `vercel.json` is the backup.
6. Smoke test as each role (request -> upload -> approve -> sent to ads -> live), install the PWA on a phone, check the offline page.
7. Run `npm run test:rls` / `test:e2e` against the test project before each release; keep weekly backups.

### Known limitations
- Push on iOS needs the Home Screen app; Web push and email are best-effort.
- Lighthouse numbers are lab data (simulated slow 4G/4x CPU) from a dev machine; real phones vary.
- Signed image URLs mean thumbnails aren't served through an image CDN on the free Supabase tier.
- The board shows up to 300 matches; the list loads 24 at a time.
- Messages deep-linked from a notification only scroll into view if they are within the loaded page (use "Load earlier").
- CSP is report-only; 9 `npm audit` advisories need a Next 16 upgrade (see `docs/SECURITY.md`).

### Verified results (test project, production build)
- **Unit + RLS:** 59 tests pass (34 unit, 25 role-permission tests against a real database). `npm run check` is green.
- **Browser (Playwright):** 38 tests pass: the full workflow (request -> upload -> approve -> sent to ads -> live), board permissions, timeline, phone checks at 360 and 390 px (no horizontal scroll, 44 px tap targets, board column switcher), and axe accessibility scans in light + dark mode on desktop and phone (no serious/critical violations).
- **Lighthouse (mobile, simulated slow 4G / 4x CPU, 80 creatives, detail page with 120 comments):**

| Page | Phase 2 perf / LCP / TBT | Phase 3 perf / LCP / TBT |
|---|---|---|
| Login | 97 / 2.47 s / 106 ms | 100 / 1.82 s / 58 ms |
| Dashboard | 96 / 2.61 s / 91 ms | 98 / 2.04 s / 135 ms |
| Creatives (grid) | 96 / 2.65 s / 105 ms | 99 / 1.98 s / 91 ms |
| Creative detail | 96 / 2.62 s / 83 ms | 97 / 2.41 s / 82 ms |

CLS is 0 on every page; accessibility and best-practices scores are 100. (The Phase 2 build had no board view, so its board row is omitted.) `scripts/seed-perf.mjs` adds the bulk data to a test project.
