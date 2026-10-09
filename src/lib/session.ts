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

/** Signed URLs for storage paths (private bucket), keyed by path. */
export async function signPaths(paths: (string | null | undefined)[], expiresIn = 60 * 60) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const map: Record<string, string> = {};
  if (!unique.length) return map;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("creatives").createSignedUrls(unique, expiresIn);
  data?.forEach((d) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}
