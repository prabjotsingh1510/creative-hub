# Creative Hub

One source of truth for Meta ad creatives: versions, discussion, dates and live status. See [CLAUDE.md](CLAUDE.md) for architecture and conventions.

**Status: Phase 1 (MVP)** – auth + roles + RLS, creative CRUD, upload/preview/versions, creative-team and DP fields, statuses, per-creative realtime comments, list + detail views.

## Setup

1. **Create a Supabase project** (supabase.com). Free tier is fine (50 MB file cap).
2. **Run the migrations** in order in the Supabase SQL editor (or `supabase db push` with the CLI):
   `supabase/migrations/0001_schema.sql`, `0002_functions_triggers.sql`, `0003_rls_storage.sql`.
3. **Auth settings**: turn OFF "Allow new users to sign up" (Authentication → Sign In / Providers) – roles come from invite metadata, so open sign-up would let anyone pick a role. Then (Authentication → URL Configuration): set Site URL to your app URL and add `<app>/auth/confirm` to redirect URLs.
   **Invite email template** (Authentication → Email Templates → Invite user): change the link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password`
   (This is what lets the invitee set a password.)
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
