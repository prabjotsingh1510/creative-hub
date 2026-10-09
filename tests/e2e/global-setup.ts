import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

config({ path: ".env.test" });

/** Creates one user per role in the TEST project and stores their logins for the specs. */
export default async function globalSetup() {
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[e2e] .env.test not configured: e2e specs will be skipped.");
    writeFileSync("tests/e2e/.users.json", "{}");
    return;
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const password = "E2e-" + randomUUID();
  const users: Record<string, { email: string; password: string; name: string }> = {};
  for (const [role, name] of [["admin", "E2E Admin"], ["creative", "E2E Creative"], ["ads", "E2E Ads"]] as const) {
    const email = `e2e-${role}-${randomUUID().slice(0, 8)}@test.local`;
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
    if (error) throw error;
    users[role] = { email, password, name };
  }
  writeFileSync("tests/e2e/.users.json", JSON.stringify(users));
}
