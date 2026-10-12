"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { emailSoon } from "@/lib/email/soon";
import { canTransition } from "@/lib/workflow";
import { rateLimit } from "@/lib/rate-limit";
import { verifyStoredObject } from "@/lib/upload-verify";
import type { Role, Status } from "@/lib/types";
import {
  adsFieldsSchema,
  creativeFieldsSchema,
  requestSchema,
  statusSchema,
  trackerFieldsSchema,
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
  if (parsed.data.live_state === "live" && !parsed.data.meta_preview_link) {
    return fail("Add the Meta preview link before marking a creative live.");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("creatives").update(parsed.data).eq("id", id);
  if (error) return fail(msg(error));
  revalidatePath(`/creatives/${id}`);
  revalidatePath("/creatives");
  emailSoon();
  return { ok: true };
}

/** Ads Tracker details (product, ad/campaign/ad-set names, hooks, landing page…). Admin + ads only (guard trigger). */
export async function updateTrackerFields(
  id: string,
  input: z.input<typeof trackerFieldsSchema>,
): Promise<Result> {
  const parsed = trackerFieldsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("creatives").update(parsed.data).eq("id", id);
  if (error) return fail(msg(error));
  revalidatePath(`/creatives/${id}`);
  revalidatePath("/tracker");
  return { ok: true };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Who is acting and the creative's current status/file, for server-side transition checks. */
async function loadContext(supabase: Supabase, id: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: me }, { data: c }] = await Promise.all([
    supabase.from("profiles").select("role, active").eq("id", user.id).single(),
    supabase.from("creatives").select("status, current_version_id").eq("id", id).maybeSingle(),
  ]);
  if (!me?.active || !c) return null;
  return { role: me.role as Role, status: c.status as Status, hasFile: !!c.current_version_id };
}

/** Moves a creative to another status. Going Live must use goLive() so the DP fields are never skipped. */
export async function setStatus(id: string, status: string): Promise<Result> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return fail("Invalid status");
  if (parsed.data === "live") return fail("Use “Go live” so the went-live time and Meta preview link are recorded.");
  const supabase = await createClient();
  const ctx = await loadContext(supabase, id);
  if (!ctx) return fail("Creative not found or you are not signed in.");
  const check = canTransition(ctx.role, ctx.status, parsed.data, { hasFile: ctx.hasFile });
  if (!check.ok) return fail(check.reason);

  const patch: Record<string, unknown> = { status: parsed.data };
  // Keep live_state coherent when ads/admin move into live-ish statuses.
  if (parsed.data === "paused") patch.live_state = "paused";
  if (parsed.data === "rejected") patch.live_state = "rejected";
  const { error } = await supabase.from("creatives").update(patch).eq("id", id);
  if (error) return fail(msg(error));
  revalidatePath(`/creatives/${id}`);
  revalidatePath("/creatives");
  emailSoon();
  return { ok: true };
}

const goLiveSchema = z.object({
  wentLiveAt: z.string().datetime("Pick the went-live date and time"),
  metaPreviewLink: z
    .string()
    .trim()
    .min(1, "Meta preview link is required")
    .max(2000)
    .refine((v) => /^https?:\/\//i.test(v), "Link must start with http:// or https://"),
});

/** Sets a creative live with the required DP details in one validated update. */
export async function goLive(id: string, input: z.input<typeof goLiveSchema>): Promise<Result> {
  const parsed = goLiveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const ctx = await loadContext(supabase, id);
  if (!ctx) return fail("Creative not found or you are not signed in.");
  const check = canTransition(ctx.role, ctx.status, "live", { hasFile: ctx.hasFile });
  if (!check.ok) return fail(check.reason);
  const { error } = await supabase
    .from("creatives")
    .update({
      live_state: "live",
      went_live_at: parsed.data.wentLiveAt,
      meta_preview_link: parsed.data.metaPreviewLink,
    })
    .eq("id", id);
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
  const limited = await rateLimit("upload", 20, 600);
  if (limited) return fail(limited);
  const unsafe = await verifyStoredObject(input.filePath, input.mime);
  if (unsafe) return fail(unsafe);
  // The thumbnail is optional: drop it (and delete it) if it isn't a real image.
  let thumbPath = input.thumbPath;
  if (thumbPath && (await verifyStoredObject(thumbPath, "image/webp"))) thumbPath = null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_creative_version", {
    p_creative: input.creativeId,
    p_file_path: input.filePath,
    p_thumb_path: thumbPath,
    p_mime: input.mime,
    p_size: input.size,
  });
  if (error) return fail(msg(error));
  revalidatePath(`/creatives/${input.creativeId}`);
  revalidatePath("/creatives");
  emailSoon();
  return { ok: true };
}
