import "server-only";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/session";
import { sanitizeSearch, type ListFilters } from "@/lib/filters";
import type { Creative } from "@/lib/types";

export const PAGE_SIZE = 24;
export const KANBAN_LIMIT = 300;

/** What a list card / table row / kanban card needs. Safe to send to the browser. */
export interface CardRow {
  id: string;
  title: string;
  campaign: string | null;
  format: Creative["format"];
  status: Creative["status"];
  live_state: Creative["live_state"];
  due_date: string | null;
  submitted_at: string | null;
  timing: string;
  version_no: number | null;
  comment_count: number;
  current_version_id: string | null;
  deleted_at: string | null;
  thumbUrl?: string;
}

const COLUMNS =
  "id,title,campaign,format,status,live_state,due_date,submitted_at,timing,version_no,comment_count,current_version_id,deleted_at,thumb_path,file_path,mime";

/**
 * Filtered, sorted creatives for the grid, table and kanban views (one place so they always agree).
 * Fetches `limit + 1` rows to tell whether more exist.
 */
export async function loadCreativeCards(
  filters: ListFilters,
  { offset = 0, limit = PAGE_SIZE }: { offset?: number; limit?: number } = {},
): Promise<{ rows: CardRow[]; hasMore: boolean; error?: string }> {
  const supabase = await createClient();

  // Free-text search (title, campaign, brief, notes, comments) resolves to ids first.
  let searchIds: string[] | null = null;
  const term = sanitizeSearch(filters.q);
  if (term) {
    const { data } = await supabase.rpc("search_creative_ids", { q: term });
    searchIds = (data ?? []) as string[];
    if (!searchIds.length) return { rows: [], hasMore: false };
  }

  let q = supabase.from("creatives_list").select(COLUMNS);
  q = filters.deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  if (filters.status.length) q = q.in("status", filters.status);
  if (filters.live.length) q = q.in("live_state", filters.live);
  if (filters.campaign) q = q.eq("campaign", filters.campaign);
  if (filters.format) q = q.eq("format", filters.format);
  if (filters.uploader) q = q.contains("uploader_ids", [filters.uploader]);
  if (filters.timing) q = q.eq("timing", filters.timing);
  if (filters.dueFrom) q = q.gte("due_date", filters.dueFrom);
  if (filters.dueTo) q = q.lte("due_date", filters.dueTo);
  // Date ranges are IST calendar days.
  if (filters.subFrom) q = q.gte("submitted_at", `${filters.subFrom}T00:00:00+05:30`);
  if (filters.subTo) q = q.lte("submitted_at", `${filters.subTo}T23:59:59.999+05:30`);
  if (searchIds) q = q.in("id", searchIds);

  // `id` is a stable tie-break so pages never overlap or skip rows.
  q =
    filters.sort === "due"
      ? q.order("due_date", { ascending: true, nullsFirst: false }).order("id")
      : filters.sort === "updated"
        ? q.order("updated_at", { ascending: false }).order("id")
        : filters.sort === "live"
          ? q.order("went_live_at", { ascending: false, nullsFirst: false }).order("id")
          : q.order("created_at", { ascending: false }).order("id");
  q = q.range(offset, offset + limit);

  const { data, error } = await q;
  if (error) return { rows: [], hasMore: false, error: error.message };

  type Raw = CardRow & { thumb_path: string | null; file_path: string | null; mime: string | null };
  const raw = (data ?? []) as unknown as Raw[];
  const hasMore = raw.length > limit;
  const page = raw.slice(0, limit);
  const thumbPath = (r: Raw) => r.thumb_path ?? (r.mime?.startsWith("image/") ? r.file_path : null);
  const urls = await signPaths(page.map(thumbPath));

  const rows: CardRow[] = page.map((r) => {
    const { thumb_path, file_path, mime, ...rest } = r;
    void file_path;
    void mime;
    const path = thumb_path ?? (r.mime?.startsWith("image/") ? r.file_path : null);
    return { ...rest, thumbUrl: path ? urls[path] : undefined };
  });
  return { rows, hasMore };
}
