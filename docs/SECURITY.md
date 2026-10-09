# Security review (Phase 3)

Scope: every table's RLS, storage policies, signed URLs, upload validation, rate limits, secrets, headers, dependencies.
Method: read all migrations (0001-0012) and server code, plus the executable test suites (`tests/rls`, `supabase/tests/phase2.sql`).
**Honesty note:** the RLS and e2e suites were written and type-checked but have not been run against a database yet (they need the separate test project). Findings below marked *fixed* are fixed in code/migrations; run the suites to confirm.

## Row Level Security, table by table
| Table | Read | Write | Notes |
|---|---|---|---|
| profiles | active roles (own row if deactivated) | self (name/avatar/digest); admin (role, active, email) | trigger blocks non-admins changing role/active/email |
| creatives | active roles; deleted rows admin-only | insert: admin; update: all roles but a trigger enforces columns + status rules; **no DELETE policy** | rules: migrations 0002/0004/0008/0009 |
| creative_versions | active roles | only via `add_creative_version()` (insert/update/delete revoked) | upload allowed for admin + creative |
| comments (+attachments, mentions) | active roles | insert as self; only `pinned` mutable; no delete | |
| notifications | own rows | clients may set `read_at` only; created by triggers | insert/delete revoked |
| notification_preferences, push_subscriptions | own rows | own rows | |
| activity_log | follows creatives visibility | **nobody** (definer functions only; trigger blocks update/delete even for owner) | |
| channels / messages (+attachments, mentions, reads) | by `allowed_roles` | insert as self; pin admin-only; no delete | |
| due_reminders, digest_log, rate_limits | nobody (RLS on, no policy) | service role / definer functions | |
| storage `creatives` bucket | active roles | admin+creative: any path; everyone: `comments/` and `channels/`; **no update/delete** | private; 50 MB; MIME allow-list |

## Findings
| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High (spec) | Ads could change status/live state on creatives never sent to ads; anyone could move to Submitted without a file | **Fixed** 0009 (+ `lib/workflow.ts`, server actions) |
| 2 | High (found in testing) | Creative-role uploads were blocked by the guard trigger (Phase 1 bug) | **Fixed** 0008 |
| 3 | Medium | Upload type trusted the client's MIME header | **Fixed**: magic-byte sniffing in the browser and on the server (`lib/sniff.ts`, `upload-verify.ts`); mismatched objects are deleted |
| 4 | Medium | Deactivated users kept reading the team directory until their session expired | **Fixed** 0012 |
| 5 | Medium | No rate limiting on invites, comments, messages, uploads | **Fixed** DB-backed limiter (0010/0012); login throttling is Supabase Auth's own (enable CAPTCHA/Attack Protection in the dashboard for more) |
| 6 | Low | `check_rate_limit` accepted arbitrary keys (table bloat) | **Fixed** 0012 |
| 7 | Low | `email_claimed_at` client-editable | **Fixed** 0009 |
| 8 | Low | No security headers | **Fixed**: nosniff, frame-deny, referrer, permissions, HSTS; CSP is **report-only** (see below) |
| 9 | Low | Push subscribe endpoint relied on cookies only | **Fixed**: JSON-only content type (blocks cross-site form posts) |
| 10 | Info | `handle_new_user` trusts invite metadata for the role, so **public sign-up must stay disabled** | Open (documented). Verify in Supabase: Authentication → Sign In / Providers → "Allow new users to sign up" = off |
| 11 | Info | CSP is report-only because Next.js needs inline scripts; enforcing needs nonces | Open |
| 12 | Info | Signed URLs last 2 hours and are bearer links; whoever has the URL can open that file until it expires | Accepted; shorter TTL = more re-signing |
| 13 | Info | Admin/creative can upload junk to the bucket without registering it (storage cost only; 50 MB cap, MIME allow-list, no overwrite) | Accepted; clean orphans occasionally |
| 14 | Info | Deactivating a user does not revoke their JWT immediately (≤1 h); RLS already blocks all data access for them | Accepted |
| 15 | Info | `npm audit`: 9 advisories remain (postcss inside Next 15, braces via tooling). They need attacker-controlled CSS / glob input at build time, not reachable at runtime; the fix is a Next 16 major upgrade | Open, schedule an upgrade |

## Checked and fine
- No `dangerouslySetInnerHTML`; email HTML is escaped (tested); CSV export neutralises spreadsheet formulas (tested).
- The service-role key is imported only by server modules (`server-only`); the only `NEXT_PUBLIC_*` values are the Supabase URL/anon key, site URL, VAPID *public* key and Sentry DSN.
- Cron endpoint: fails closed without `CRON_SECRET`; constant-time bearer comparison.
- Server actions re-validate with Zod and the shared `canTransition()`; the database still enforces every rule independently.
- Cursor pagination validates cursors with a strict pattern (no filter injection; tested).
