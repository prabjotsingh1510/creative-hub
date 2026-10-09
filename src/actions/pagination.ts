"use server";

import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/session";
import { PAGE, cursorOf, isCursor, olderThan, takePage, type Cursor } from "@/lib/cursor";
import type { ActivityRow, CommentAttachment, CommentRow } from "@/lib/types";
import type { NotificationRow } from "@/lib/notifications";

type Page<T> = { ok: true; rows: T[]; hasMore: boolean; next: Cursor | null } | { ok: false; error: string };
const bad = { ok: false as const, error: "Invalid request" };

type CommentWithAtt = CommentRow & { comment_attachments: CommentAttachment[] };
export type CommentPageRow = CommentRow & { attachments: (CommentAttachment & { url?: string })[] };

/** Older comments for a creative (oldest-first within the returned page). */
export async function loadEarlierComments(creativeId: string, cursor: Cursor): Promise<Page<CommentPageRow>> {
  if (!isCursor(cursor) || !/^[0-9a-f-]{36}$/i.test(creativeId)) return bad;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("*, comment_attachments(*)")
    .eq("creative_id", creativeId)
    .or(olderThan(cursor))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (error) return { ok: false, error: error.message };
  const { page, hasMore } = takePage((data ?? []) as CommentWithAtt[]);
  const urls = await signPaths(page.flatMap((c) => c.comment_attachments.map((a) => a.path)));
  const rows = page.reverse().map(({ comment_attachments, ...c }) => ({
    ...c,
    attachments: comment_attachments.map((a) => ({ ...a, url: urls[a.path] })),
  }));
  return { ok: true, rows, hasMore, next: rows.length ? cursorOf(rows[0]) : null };
}

/** Older activity events for a creative (newest-first). */
export async function loadMoreActivity(creativeId: string, cursor: Cursor): Promise<Page<ActivityRow>> {
  if (!isCursor(cursor) || !/^[0-9a-f-]{36}$/i.test(creativeId)) return bad;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .eq("creative_id", creativeId)
    .or(olderThan(cursor))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (error) return { ok: false, error: error.message };
  const { page, hasMore } = takePage((data ?? []) as ActivityRow[]);
  return { ok: true, rows: page, hasMore, next: page.length ? cursorOf(page[page.length - 1]) : null };
}

/** Older notifications for the signed-in user. */
export async function loadMoreNotifications(cursor: Cursor, unreadOnly: boolean): Promise<Page<NotificationRow>> {
  if (!isCursor(cursor)) return bad;
  const supabase = await createClient();
  let q = supabase.from("notifications").select("*").or(olderThan(cursor)).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE + 1);
  if (unreadOnly) q = q.is("read_at", null);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const { page, hasMore } = takePage((data ?? []) as NotificationRow[]);
  return { ok: true, rows: page, hasMore, next: page.length ? cursorOf(page[page.length - 1]) : null };
}

export interface ChatPageRow {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  pinned: boolean;
  parent_id: string | null;
  created_at: string;
  attachments: { id: string; path: string; mime: string; name: string; url?: string }[];
}

/** Older top-level channel messages plus their replies (oldest-first). */
export async function loadEarlierMessages(channelId: string, cursor: Cursor): Promise<Page<ChatPageRow>> {
  if (!isCursor(cursor) || !/^[0-9a-f-]{36}$/i.test(channelId)) return bad;
  const supabase = await createClient();
  const { data: tops, error } = await supabase
    .from("messages")
    .select("*, message_attachments(*)")
    .eq("channel_id", channelId)
    .is("parent_id", null)
    .or(olderThan(cursor))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (error) return { ok: false, error: error.message };
  const { page, hasMore } = takePage(tops ?? []);
  const { data: replies } = page.length
    ? await supabase.from("messages").select("*, message_attachments(*)").in("parent_id", page.map((m) => m.id)).order("created_at")
    : { data: [] };
  const all = [...page, ...(replies ?? [])] as (ChatPageRow & { message_attachments: ChatPageRow["attachments"] })[];
  const urls = await signPaths(all.flatMap((m) => (m.message_attachments ?? []).map((a) => a.path)));
  const rows: ChatPageRow[] = all
    .map(({ message_attachments, ...m }) => ({ ...m, attachments: (message_attachments ?? []).map((a) => ({ ...a, url: urls[a.path] })) }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const oldestTop = page[page.length - 1];
  return { ok: true, rows, hasMore, next: oldestTop ? cursorOf(oldestTop) : null };
}
