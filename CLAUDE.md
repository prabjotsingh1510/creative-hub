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
