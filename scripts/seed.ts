/**
 * Seeds demo users (one per role) and sample creatives.
 * Usage: npm run seed   (reads .env.local; needs SUPABASE_SERVICE_ROLE_KEY)
 * Safe to re-run: existing users are reused, creatives are only added if none exist.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
if (/\.supabase\.co/.test(url) && process.env.SEED_ALLOW_REMOTE !== "1") {
  throw new Error("Refusing to seed a hosted project without SEED_ALLOW_REMOTE=1 (demo passwords are public).");
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const PASSWORD = "demo-password-123";

const USERS = [
  { email: "prabjot@demo.test", name: "Prabjot", role: "admin", team: "Company" },
  { email: "creative@demo.test", name: "OutOfCtrl Designer", role: "creative", team: "OutOfCtrl" },
  { email: "rajat@demo.test", name: "Rajat", role: "ads", team: "Decision Pinnacle" },
] as const;

async function ensureUser(u: (typeof USERS)[number]) {
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users.find((x) => x.email === u.email);
  if (existing) return existing.id;
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: u.name, role: u.role, team: u.team },
  });
  if (error) throw error;
  return data.user.id;
}

/** Phase 2 sample data: activity timeline, notifications and General channel messages. */
async function seedPhase2(ids: Record<string, string>) {
  const { data: creatives } = await supabase.from("creatives").select("id, title").order("created_at").limit(3);
  const first = creatives?.[0];

  if (first) {
    const { count } = await supabase.from("activity_log").select("id", { count: "exact", head: true }).eq("creative_id", first.id).eq("action", "field_changed");
    if (!count) {
      const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
      const { error } = await supabase.from("activity_log").insert([
        { creative_id: first.id, actor_id: ids.admin, action: "field_changed", from_value: "2026-10-20", to_value: "2026-10-24", meta: { field: "due_date" }, created_at: ago(30) },
        { creative_id: first.id, actor_id: ids.creative, action: "comment", meta: {}, created_at: ago(20) },
        { creative_id: first.id, actor_id: ids.admin, action: "pinned", meta: {}, created_at: ago(19) },
      ]);
      if (error) throw error;
    }
  }

  const { count: notifCount } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("type", "mention");
  if (!notifCount && first) {
    const { error } = await supabase.from("notifications").insert([
      { user_id: ids.creative, type: "mention", creative_id: first.id, actor_id: ids.admin, payload: { title: first.title, snippet: "Can we try a warmer palette?" }, email_status: "skipped" },
      { user_id: ids.ads, type: "status_changed", creative_id: first.id, actor_id: ids.admin, payload: { title: first.title, from: "approved", to: "sent_to_ads" }, email_status: "skipped" },
      { user_id: ids.admin, type: "due_soon", creative_id: first.id, payload: { title: first.title, due_date: new Date().toISOString().slice(0, 10) }, email_status: "skipped" },
    ]);
    if (error) throw error;
  }

  const { data: general } = await supabase.from("channels").select("id").eq("slug", "general").single();
  if (general) {
    const { count: msgCount } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("channel_id", general.id);
    if (!msgCount) {
      const { data: top, error } = await supabase
        .from("messages")
        .insert([
          { channel_id: general.id, author_id: ids.admin, body: "Welcome to Creative Hub! Please use creative threads for feedback and this channel for everything else.", pinned: true },
          { channel_id: general.id, author_id: ids.ads, body: "Quick question: what is the preferred max video length for Reels?" },
        ])
        .select("id");
      if (error) throw error;
      const { error: e2 } = await supabase.from("messages").insert({
        channel_id: general.id,
        author_id: ids.creative,
        parent_id: top![1].id,
        body: "15 seconds works best for us. Anything longer, send a Drive link.",
      });
      if (e2) throw e2;
    }
  }
  console.log("Seeded sample activity, notifications and General messages.");
}

async function main() {
  const ids: Record<string, string> = {};
  for (const u of USERS) ids[u.role] = await ensureUser(u);

  const { count } = await supabase.from("creatives").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    console.log("Creatives already exist; skipping sample data.");
  } else {
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const rows = [
      { title: "Diwali Sale – Hero Image", campaign: "Diwali 2026", format: "image", brief: "Warm festive tone, 20% off headline.", due_date: day(3) },
      { title: "Product Reel – Unboxing", campaign: "Spring Launch", format: "video", brief: "15s vertical, hook in first 2s.", due_date: day(-2) },
      { title: "Carousel – 5 Reasons", campaign: "Evergreen", format: "carousel", brief: "Five slides, brand colours.", due_date: day(7) },
    ].map((r) => ({ ...r, created_by: ids.admin }));
    const { error } = await supabase.from("creatives").insert(rows);
    if (error) throw error;
    console.log(`Inserted ${rows.length} sample creative requests (no files; upload as the creative user).`);
  }

  console.log("\nDemo logins (password for all: " + PASSWORD + ")");
  USERS.forEach((u) => console.log(`  ${u.role.padEnd(9)} ${u.email}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
