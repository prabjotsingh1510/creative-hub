import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-user fixed-window rate limit backed by the database (migration 0010), so it works across
 * serverless instances. Returns an error message when over the limit, otherwise null.
 * Fails open if the limiter itself is unavailable, so a missing migration never locks users out.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
    console.error("[rate-limit] unavailable:", error.message);
    return null;
  }
  return data === false ? "You’re doing that too fast. Please wait a moment and try again." : null;
}
