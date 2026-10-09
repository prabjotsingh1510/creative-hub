"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { emailSoon } from "@/lib/email/soon";
import {
  adsFieldsSchema,
  creativeFieldsSchema,
  requestSchema,
  statusSchema,
  validateCreativeFile,
} from "@/lib/validators";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const msg = (e: { message: string }) => e.message.replace(/^.*?exception:?\s*/i, "");

export async function createRequest(input: z.input<typeof requestSchema>): Promise<Result<{ id: string }>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not signed in");
  const { data, error } = await supabase
    .from("creatives")
    .insert({ ...parsed.data, created_by: user.id })
    .select("id")
    .single();
  if (error) return fail(msg(error));
  revalidatePath("/creatives");
  emailSoon();
  return { ok: true, data: { id: data.id } };
}

export async function updateCreativeFields(
  id: string,
  input: z.input<typeof creativeFieldsSchema>,
): Promise<Result> {
  const parsed = creativeFieldsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("creatives").update(parsed.data).eq("id", id);
  if (error) return fail(msg(error));
  revalidatePath(`/creatives/${id}`);
  return { ok: true };
}

const adminFieldsSchema = z.object({
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  brief: z.string().max(5000).nullable(),
  submitted_at: z.string().datetime().nullable(),
  reference_links: z.array(z.string().url()).max(10),
});

/** Admin-only fields (enforced by the guard trigger). */
export async function updateAdminFields(
  id: string,
  input: z.input<typeof adminFieldsSchema>,
): Promise<Result> {
  const parsed = adminFieldsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("creatives").update(parsed.data).eq("id", id);
  if (error) return fail(msg(error));
  revalidatePath(`/creatives/${id}`);
  return { ok: true };
}

export async function updateAdsFields(
  id: string,
  input: z.input<typeof adsFieldsSchema>,
): Promise<Result> {
  const parsed = adsFieldsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("creatives").update(parsed.data).eq("id", id);
  if (error) return fail(msg(error));
  revalidatePath(`/creatives/${id}`);
  revalidatePath("/creatives");
  emailSoon();
  return { ok: true };
}

export async function setStatus(id: string, status: string): Promise<Result> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return fail("Invalid status");
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status: parsed.data };
  // Keep live_state coherent when ads/admin move into or out of live-ish statuses.
  if (parsed.data === "live") patch.live_state = "live";
  if (parsed.data === "paused") patch.live_state = "paused";
  if (parsed.data === "rejected") patch.live_state = "rejected";
  const { error } = await supabase.from("creatives").update(patch).eq("id", id);
  if (error) return fail(msg(error));
  revalidatePath(`/creatives/${id}`);
  revalidatePath("/creatives");
  emailSoon();
  return { ok: true };
}

export async function setDeleted(id: string, deleted: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("creatives")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return fail(msg(error));
  revalidatePath("/creatives");
  revalidatePath(`/creatives/${id}`);
  return { ok: true };
}

/** Called after the browser has uploaded the file to Storage. */
export async function registerVersion(input: {
  creativeId: string;
  filePath: string;
  thumbPath: string | null;
  mime: string;
  size: number;
}): Promise<Result> {
  const problem = validateCreativeFile({ type: input.mime, size: input.size });
  if (problem) return fail(problem);
  if (!input.filePath.startsWith(`${input.creativeId}/`)) return fail("Invalid file path");
  if (input.thumbPath && !input.thumbPath.startsWith(`${input.creativeId}/`)) return fail("Invalid file path");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_creative_version", {
    p_creative: input.creativeId,
    p_file_path: input.filePath,
    p_thumb_path: input.thumbPath,
    p_mime: input.mime,
    p_size: input.size,
  });
  if (error) return fail(msg(error));
  revalidatePath(`/creatives/${input.creativeId}`);
  revalidatePath("/creatives");
  emailSoon();
  return { ok: true };
}
