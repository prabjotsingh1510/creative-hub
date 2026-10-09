"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validateAttachment } from "@/lib/validators";
import { emailSoon } from "@/lib/email/soon";
import type { Result } from "./creatives";

const schema = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1, "Write something first").max(5000),
  parentId: z.string().uuid().nullable(),
  mentionIds: z.array(z.string().uuid()).max(20),
  attachments: z
    .array(z.object({ path: z.string(), mime: z.string(), size: z.number(), name: z.string().max(200) }))
    .max(5),
});

export async function postMessage(input: z.input<typeof schema>): Promise<Result<{ id: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { channelId, body, parentId, mentionIds, attachments } = parsed.data;
  for (const a of attachments) {
    const bad = validateAttachment({ type: a.mime, size: a.size });
    if (bad) return { ok: false, error: bad };
    if (!a.path.startsWith(`channels/${channelId}/`)) return { ok: false, error: "Invalid attachment path" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: m, error } = await supabase
    .from("messages")
    .insert({ channel_id: channelId, author_id: user.id, body, parent_id: parentId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message.replace(/^.*?exception:?\s*/i, "") };

  const ids = [...new Set(mentionIds)].filter((id) => id !== user.id);
  if (ids.length) await supabase.from("message_mentions").insert(ids.map((user_id) => ({ message_id: m.id, user_id })));
  if (attachments.length) {
    await supabase.from("message_attachments").insert(
      attachments.map((a) => ({ message_id: m.id, path: a.path, mime: a.mime, size_bytes: a.size, name: a.name })),
    );
  }
  emailSoon();
  return { ok: true, data: { id: m.id } };
}

export async function setMessagePinned(id: string, pinned: boolean): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("messages").update({ pinned }).eq("id", id).select("id");
  if (error) return { ok: false, error: error.message.replace(/^.*?exception:?\s*/i, "") };
  if (!data?.length) return { ok: false, error: "Only admins can pin messages." };
  return { ok: true };
}

export async function markChannelRead(channelId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase
    .from("channel_reads")
    .upsert({ user_id: user.id, channel_id: channelId, last_read_at: new Date().toISOString() }, { onConflict: "user_id,channel_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
