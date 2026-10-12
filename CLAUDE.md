# Creative Hub

Replaces a WhatsApp group for managing Meta ad creatives. One card per creative: versions, dates, discussion, workflow + live status.
Parties: **admin** (Prabjot), **creative** (OutOfCtrl), **ads** (Decision Pinnacle / Rajat).

## Stack
Next.js 15 (App Router, TS) · Tailwind v4 · shadcn/ui (base-ui flavour, `render` not `asChild`) · Supabase (Postgres, Auth, Storage, Realtime, RLS) · Zod · Vitest · deploy on Vercel.

## Commands
- `npm run dev` – local server · `npm run build`
- `npm run check` – lint + typecheck + tests (run before declaring any phase done)
- `npm run seed` – demo users + sample requests (needs `.env.local`; refuses `*.supabase.co` unless `SEED_ALLOW_REMOTE=1`)

## Conventions
- **Permissions live in the database.** `supabase/migrations/0002` triggers + `0003` RLS are the source of truth; `src/lib/permissions.ts` only mirrors them for UI gating. Change both together.
- Mutations are server actions in `src/actions/*` using the user-session Supabase client (RLS applies). The service-role client (`lib/supabase/admin.ts`, server-only) is used only for invites and seeding.
- Action return shape: `{ ok: true, data? } | { ok: false, error }`. Never throw to the client.
- Files go browser → private Storage bucket `creatives` (paths `<creativeId>/…`, `comments/<creativeId>/…`), then `registerVersion` calls the `add_creative_version` RPC. Thumbnails/poster frames are generated client-side (`lib/upload.ts`). Always display via signed URLs (`lib/session.ts#signPaths`).
- Time: store UTC `timestamptz`; `due_date` is a plain `date` (IST calendar day, deadline = 23:59:59 IST). Always format via `lib/time.ts` (Asia/Kolkata).
- Never hard-delete: no DELETE policies, creatives use `deleted_at`, `activity_log` is append-only (trigger blocks update/delete), comments are immutable except `pinned`.
- Native `<select>` is used for form selects (better on mobile).

## Schema (see migrations for detail)
`profiles(id, name, email, role, team, avatar_url, active)` ·
`creatives(id, title, campaign, format, brief, reference_links, due_date, submitted_at, drive_link, copy_notes, status, live_state, is_live*, went_live_at, meta_preview_link, ads_notes, current_version_id, created_by, deleted_at, deleted_by)` ·
`creative_versions(creative_id, version_no, file_path, thumb_path, mime, size_bytes, uploaded_by)` ·
`comments(creative_id, version_id?, author_id, body, pinned)` · `comment_attachments` · `mentions` ·
`activity_log(creative_id, actor_id, action, from_value, to_value, meta)` ·

### Phase 2 additions (migrations 0004-0007)
- `notifications(user_id, type, creative_id, actor_id, comment_id, message_id, payload, read_at, dedupe_key, email_status, email_attempts)` — **created only by DB triggers via `notify()`** (security definer; never notifies the actor; sets email_status from `notification_preferences` or `default_email_pref()`). Clients can only set `read_at`. Event types live in `lib/notifications.ts` (keep in sync with the `notifications_type_check` constraint and `default_email_pref`).
- `notification_preferences(user_id, event_type, email)`, `profiles.daily_digest`, `due_reminders` (unique creative+kind+due_date), `digest_log`.
- `activity_log` now also records `field_changed` (meta.field, old→new), `pinned`/`unpinned`. Insert only via security-definer functions; immutable for everyone; readable per creatives RLS.
- `channels(slug, allowed_roles, archived_at)`, `messages(parent_id)` one-level threads, `message_attachments`, `message_mentions`, `channel_reads` (unread via `channel_unread_counts()`); pin = admin only. Add channels by inserting a row — no migration needed.
- `creatives_list` view (security_invoker) adds `timing` (on_time/late/overdue/pending/none), `deadline_at`, current file + `uploader_ids`; `search_creative_ids(q)` does ILIKE (pg_trgm indexed) over creative fields + comment text.
- Emails: `lib/email/dispatch.ts` (`claim_pending_emails` RPC → Resend), `emailSoon()` after actions, `/api/cron/reminders` (Bearer `CRON_SECRET`) = reminders + email retry + digests. Scheduler options in README.
- List filters are URL params parsed by `lib/filters.ts` (single source for parse/serialise/quick filters/waiting-on-me).

Enums: `user_role(admin|creative|ads)`, `creative_status(requested|submitted|changes_requested|approved|sent_to_ads|live|paused|rejected)`, `live_state(not_live|live|paused|rejected)`.
`live_state` drives `status` for live/paused/rejected; `is_live` is generated.

Key DB functions/triggers: `guard_creative_update` (column-level role rules, status transitions, live auto-timestamp, activity logging), `add_creative_version` (assigns version_no, sets current + `submitted_at` + status), `handle_new_user` (profile from invite metadata).

## Future (don't build yet, keep easy to add)
WhatsApp/Slack alerts (route all notifications through one `notify()` in Phase 2), social posting calendar for OutOfCtrl, Meta Ads API metrics per creative (`creative_metrics` table keyed by creative_id).

## Phase 3 conventions
- **Workflow rules live in `src/lib/workflow.ts`** (`canTransition`, `canEditLiveState`, board columns). The UI, server actions (`setStatus`, `goLive`) and tests share it; the database trigger `guard_creative_update` (0009) enforces the same rules. Change both together and update `tests/workflow.test.ts` + `tests/rls`.
- Going Live always goes through `goLive()` (went-live time + Meta link required); `setStatus('live')` is rejected.
- One query path for grid/table/board: `lib/creatives-data.ts#loadCreativeCards` (filters from `lib/filters.ts`). Lists paginate by offset with a stable `id` tie-break; comments, activity, notifications and channel messages use **keyset cursors** (`lib/cursor.ts`, `actions/pagination.ts`).
- Uploads: browser -> Storage via TUS (`lib/upload.ts`), then `registerVersion` verifies magic bytes (`lib/sniff.ts`, `lib/upload-verify.ts`) and rate-limits (`lib/rate-limit.ts`). Never trust the client MIME type.
- `signPaths` caches signed URLs per server instance (~1 h reuse) so browsers can cache thumbnails.
- Heavy client libraries (tus, zoom/pan, Supabase browser client on /login) are imported on demand; keep first-load JS small. Never run `next build` while `next dev` is running (they share `.next`).
- PWA: `app/manifest.ts`, generated icons (`lib/icon.tsx`), `public/sw.js` (offline fallback + push only, caches no private data). Push is off unless VAPID keys are set (`lib/push/dispatch.ts`).
- Tests: unit (`tests/*.test.ts`), RLS integration (`tests/rls`, needs `.env.test`), Playwright (`tests/e2e`). A role-permission change without an RLS test is incomplete.
- Security notes and open findings: `docs/SECURITY.md`.

## Ads Tracker tab (migration 0014)
- `/tracker` mirrors the "CreativeTracker_Dabble - Ads Tracker" sheet: one row per creative, creative preview pinned left, **most recently updated first** (`creatives.updated_at`, stamped by `guard_creative_update`). Sheet columns map to existing fields (Asset Name=`title`, Shared Date=`submitted_at`, Go-live=`went_live_at`, Meta status=`live_state`, Last Edited=`updated_at`, Media Type=`format`) plus the new tracker columns on `creatives`.
- Tracker columns are editable by admin + ads only (creative role is blocked in the guard trigger); edit form = `TrackerSection` on the creative detail page → `updateTrackerFields`.
- Read path: `tracker_list` view (adds stable `sno`, current-file thumbnail) via `lib/tracker-data.ts`; sheet mapping/CSV header in `lib/tracker.ts`. `/api/tracker/export` emits the sheet's column order.

## Roadmap (design only, not built)
Extension points already in place so these are additive:
1. **WhatsApp / Slack alerts.** All events flow through `notify()` (DB) into `notifications`. Add a channel the same way email/push work: new `<channel>_status/_attempts/_claimed_at` columns, a `claim_pending_<channel>()` function, a `lib/<channel>/dispatch.ts` called from `emailSoon()` and `/api/cron/reminders`, and a per-user opt-in table (`notification_preferences` already supports per-event toggles). Slack: incoming webhook or bot; WhatsApp: Business Cloud API with approved templates (24-hour session rules apply). Keep tokens server-only.
2. **OutOfCtrl social posting calendar.** New tables `social_posts(id, title, caption, platform, scheduled_for timestamptz, status, created_by, creative_id null)` and `social_post_assets`; RLS: creative + admin write, ads read. Reuse `activity_log` (add a nullable `social_post_id` or a generic `entity`), `notifications` types, the date helpers in `lib/time.ts` (IST) and the card/board components; a calendar view is a new page under `(app)/social`. Auto-publishing to Meta/Instagram would be a later cron.
3. **Meta Ads performance metrics.** Add `meta_ad_id text` to `creatives` (admin/ads editable, validated) and `creative_metrics(creative_id, day date, spend, impressions, clicks, ctr, roas, fetched_at, primary key(creative_id, day))` with read access for all roles and writes only by the service role. A cron route (like `/api/cron/reminders`) pulls Insights from the Marketing API using a system-user token stored as a server env var, and the detail page gets a metrics panel. The existing Meta preview link can be parsed for the ad ID as a fallback.
