"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validateAttachment } from "@/lib/validators";
import { emailSoon } from "@/lib/email/soon";
import { rateLimit } from "@/lib/rate-limit";
import { verifyStoredObject } from "@/lib/upload-verify";
import type { Result } from "./creatives";

const schema = z.object({
  creativeId: z.string().uuid(),
  body: z.string().trim().min(1, "Write something first").max(5000),
  versionId: z.string().uuid().nullable(),
  mentionIds: z.array(z.string().uuid()).max(20),
  attachments: z
    .array(z.object({ path: z.string(), mime: z.string(), size: z.number(), name: z.string().max(200) }))
    .max(5),
});

export async function addComment(input: z.input<typeof schema>): Promise<Result<{ id: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { creativeId, body, versionId, mentionIds, attachments } = parsed.data;

  for (const a of attachments) {
    const bad = validateAttachment({ type: a.mime, size: a.size });
    if (bad) return { ok: false, error: bad };
    if (!a.path.startsWith(`comments/${creativeId}/`)) return { ok: false, error: "Invalid attachment path" };
  }

  const limited = await rateLimit("comment", 30, 60);
  if (limited) return { ok: false, error: limited };
  for (const a of attachments) {
    const unsafe = await verifyStoredObject(a.path, a.mime);
    if (unsafe) return { ok: false, error: `${a.name}: ${unsafe}` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: c, error } = await supabase
    .from("comments")
    .insert({ creative_id: creativeId, version_id: versionId, author_id: user.id, body })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (mentionIds.length) {
    await supabase
      .from("mentions")
      .insert([...new Set(mentionIds)].map((user_id) => ({ comment_id: c.id, user_id })));
  }
  if (attachments.length) {
    await supabase.from("comment_attachments").insert(
      attachments.map((a) => ({
        comment_id: c.id,
        path: a.path,
        mime: a.mime,
        size_bytes: a.size,
        name: a.name,
      })),
    );
  }
  emailSoon();
  return { ok: true, data: { id: c.id } };
}

export async function setPinned(commentId: string, pinned: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("comments").update({ pinned }).eq("id", commentId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
