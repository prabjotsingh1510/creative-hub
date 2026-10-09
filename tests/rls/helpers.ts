import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Integration tests run against a SEPARATE Supabase test project (never production):
// TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY / TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test.
config({ path: ".env.test" });

export const TEST_URL = process.env.TEST_SUPABASE_URL ?? "";
const ANON = process.env.TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
export const dbEnabled = Boolean(TEST_URL && ANON && SERVICE);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const service = (): SupabaseClient => createClient(TEST_URL, SERVICE, opts);
export const anonClient = (): SupabaseClient => createClient(TEST_URL, ANON, opts);

export type Role = "admin" | "creative" | "ads";
export interface TestUser {
  id: string;
  email: string;
  role: Role;
  client: SupabaseClient;
}

const PASSWORD = "Rls-test-" + randomUUID();

export async function makeUser(role: Role, tag = ""): Promise<TestUser> {
  const email = `rls-${role}-${tag}${randomUUID().slice(0, 8)}@test.local`;
  const admin = service();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: `RLS ${role} ${tag}`.trim(), role },
  });
  if (error) throw error;
  const client = anonClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw e2;
  return { id: data.user.id, email, role, client };
}

/** A client call is "denied" if it errors OR silently affects/returns no rows (RLS filters rows instead of erroring). */
export function denied(res: { data?: unknown; error: unknown | null }): boolean {
  if (res.error) return true;
  const d = res.data;
  return d === null || d === undefined || (Array.isArray(d) && d.length === 0);
}

/** Creates a creative as the admin user and returns its id. */
export async function makeCreative(admin: TestUser, patch: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin.client
    .from("creatives")
    .insert({ title: `[rls-test] ${randomUUID().slice(0, 6)}`, created_by: admin.id, due_date: "2030-01-01", ...patch })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Uploads a (tiny) version as the given user through the real RPC. */
export async function uploadVersion(user: TestUser, creativeId: string) {
  return user.client.rpc("add_creative_version", {
    p_creative: creativeId,
    p_file_path: `${creativeId}/${randomUUID()}.png`,
    p_thumb_path: null,
    p_mime: "image/png",
    p_size: 1234,
  });
}

/** Moves a creative through states using the service role (bypasses the role guard) to set up a scenario. */
export async function forceStatus(creativeId: string, patch: Record<string, unknown>) {
  const { error } = await service().from("creatives").update(patch).eq("id", creativeId);
  if (error) throw error;
}
