import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkContent } from "@/lib/sniff";

/**
 * Server-side check of an uploaded object: reads only its first bytes (HTTP Range), compares them to the
 * declared MIME type, and deletes the object if it is not what it claims to be.
 * Returns an error message, or null when the file is fine.
 */
export async function verifyStoredObject(path: string, declaredMime: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("creatives").createSignedUrl(path, 60);
  if (error || !data) return "Could not verify the uploaded file.";
  const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-31" } });
  if (!res.ok && res.status !== 206) return "Could not verify the uploaded file.";
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, 32);
  const problem = checkContent(declaredMime, head);
  if (problem) {
    await admin.storage.from("creatives").remove([path]);
    return problem;
  }
  return null;
}
