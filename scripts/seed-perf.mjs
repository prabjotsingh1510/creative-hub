// TEST PROJECT ONLY: adds bulk data so Lighthouse measures realistic list/detail pages.
// Reads .env.test (never .env.local) and refuses to run if the URL matches your real project.
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.test" });
const real = readFileSync(".env.local", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
if (!process.env.TEST_SUPABASE_URL || process.env.TEST_SUPABASE_URL === real) throw new Error("Refusing: .env.test missing or points at the real project");

const db = createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: admin } = await db.from("profiles").select("id").eq("role", "admin").limit(1).single();

const statuses = ["requested", "submitted", "changes_requested", "approved", "sent_to_ads", "live", "paused", "rejected"];
const rows = Array.from({ length: 80 }, (_, i) => ({
  title: `[perf] Festive creative ${i + 1}`,
  campaign: ["Diwali", "Spring", "Evergreen", "Winter"][i % 4],
  format: ["image", "video", "carousel"][i % 3],
  brief: "Bulk perf-test creative",
  due_date: new Date(Date.now() + ((i % 20) - 8) * 86400000).toISOString().slice(0, 10),
  status: statuses[i % statuses.length],
  created_by: admin.id,
}));
const { data: created, error } = await db.from("creatives").insert(rows).select("id");
if (error) throw error;
const comments = Array.from({ length: 120 }, (_, i) => ({ creative_id: created[0].id, author_id: admin.id, body: `Perf comment ${i + 1}: please check the latest palette and caption.` }));
const { error: e2 } = await db.from("comments").insert(comments);
if (e2) throw e2;
console.log("seeded", created.length, "creatives; detail page with 120 comments:", created[0].id);
