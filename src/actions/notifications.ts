"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_TYPES } from "@/lib/notifications";
import type { Result } from "./creatives";

export async function markRead(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function markAllRead(): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/notifications");
  return { ok: true };
}

const prefsSchema = z.object({
  email: z.record(z.enum(NOTIFICATION_TYPES), z.boolean()),
  dailyDigest: z.boolean(),
});

/** In-app notifications are always on; this stores only the email choices. */
export async function savePreferences(input: z.input<typeof prefsSchema>): Promise<Result> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid preferences" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const rows = Object.entries(parsed.data.email).map(([event_type, email]) => ({
    user_id: user.id,
    event_type,
    email,
  }));
  const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,event_type" });
  if (error) return { ok: false, error: error.message };
  const { error: e2 } = await supabase.from("profiles").update({ daily_digest: parsed.data.dailyDigest }).eq("id", user.id);
  if (e2) return { ok: false, error: e2.message };
  revalidatePath("/settings/notifications");
  return { ok: true };
}
