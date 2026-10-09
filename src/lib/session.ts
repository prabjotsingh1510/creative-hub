import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Current profile, or redirect to /login. Deduplicated per request. */
export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!data || !data.active) redirect("/login?error=inactive");
  return data as Profile;
});

// Signed URLs are reused for ~1 hour per server instance. A fresh URL on every render would defeat the
// browser cache (every page view re-downloaded every thumbnail). Paths only ever come from rows the
// caller already passed RLS for, so sharing the capability URL between requests doesn't widen access.
const SIGN_TTL = 2 * 60 * 60;
const REUSE_MIN_LEFT = 60 * 60;
const urlCache = new Map<string, { url: string; exp: number }>();

/** Signed URLs for storage paths (private bucket), keyed by path. */
export async function signPaths(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const map: Record<string, string> = {};
  if (!unique.length) return map;
  const now = Date.now() / 1000;
  const missing: string[] = [];
  for (const p of unique) {
    const hit = urlCache.get(p);
    if (hit && hit.exp - now > REUSE_MIN_LEFT) map[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("creatives").createSignedUrls(missing, SIGN_TTL);
    data?.forEach((d) => {
      if (d.path && d.signedUrl) {
        map[d.path] = d.signedUrl;
        urlCache.set(d.path, { url: d.signedUrl, exp: now + SIGN_TTL });
      }
    });
    if (urlCache.size > 3000) {
      for (const [k, v] of urlCache) if (v.exp - now < REUSE_MIN_LEFT) urlCache.delete(k);
    }
  }
  return map;
}
