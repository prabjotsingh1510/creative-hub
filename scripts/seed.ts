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
