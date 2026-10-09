import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client. Server-only; bypasses RLS. Use solely for invites and cron/seed work. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
