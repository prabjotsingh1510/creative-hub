import "server-only";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/session";
import { sanitizeSearch } from "@/lib/filters";
import { TRACKER_COLUMNS, type TrackerRow } from "@/lib/tracker";
import type { Format, LiveState } from "@/lib/types";

export const TRACKER_PAGE_SIZE = 30;

export interface TrackerFilters {
  q: string;
  month: string; // YYYY-MM (IST): month the asset was shared
  product: string;
  campaign: string;
  media: Format | "";
  live: LiveState | "";
  asset: "inhouse" | "parent" | "";
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseTrackerFilters(sp: Params): TrackerFilters {
  const media = first(sp.media);
  const live = first(sp.live);
  const asset = first(sp.asset);
  const month = first(sp.month);
  return {
    q: first(sp.q).trim().slice(0, 100),
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : "",
    product: first(sp.product).slice(0, 120),
    campaign: first(sp.campaign).slice(0, 120),
    media: media === "video" || media === "image" || media === "carousel" ? media : "",
    live: live === "live" || live === "paused" || live === "rejected" || live === "not_live" ? live : "",
    asset: asset === "inhouse" || asset === "parent" ? asset : "",
  };
}

export function trackerFiltersToParams(f: TrackerFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p;
}

type Raw = TrackerRow & { thumb_path: string | null; file_path: string | null; mime: string | null };

/** Tracker rows, most recently updated first. `limit: null` = everything (CSV export). */
export async function loadTrackerRows(
  filters: TrackerFilters,
  { offset = 0, limit = TRACKER_PAGE_SIZE }: { offset?: number; limit?: number | null } = {},
): Promise<{ rows: TrackerRow[]; hasMore: boolean; error?: string }> {
  const supabase = await createClient();

  let q = supabase.from("tracker_list").select(TRACKER_COLUMNS).is("deleted_at", null);
  const term = sanitizeSearch(filters.q);
  if (term) {
    // Commas/parentheses are PostgREST filter syntax; strip them from the pattern.
    const p = `%${term.replace(/[,()]/g, " ")}%`;
    q = q.or(
      ["title", "ad_name", "campaign", "product_advertised", "meta_campaign_name", "ad_set_name", "creator_name", "caption"]
        .map((c) => `${c}.ilike.${p}`)
        .join(","),
    );
  }
  if (filters.product) q = q.eq("product_advertised", filters.product);
  if (filters.campaign) q = q.eq("campaign", filters.campaign);
  if (filters.media) q = q.eq("format", filters.media);
  if (filters.live) q = q.eq("live_state", filters.live);
  if (filters.asset) q = q.eq("asset_type", filters.asset);
  if (filters.month) {
    const [y, m] = filters.month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const start = `${filters.month}-01T00:00:00+05:30`;
    const end = `${next}-01T00:00:00+05:30`;
    q = q.or(
      `and(submitted_at.gte.${start},submitted_at.lt.${end}),and(submitted_at.is.null,created_at.gte.${start},created_at.lt.${end})`,
    );
  }
  // `id` is a stable tie-break so pages never overlap or skip rows.
  q = q.order("updated_at", { ascending: false }).order("id");
  q = limit !== null ? q.range(offset, offset + limit) : q.limit(20000);

  const { data, error } = await q;
  if (error) return { rows: [], hasMore: false, error: error.message };

  const raw = (data ?? []) as unknown as Raw[];
  const hasMore = limit !== null && raw.length > limit;
  const page = limit !== null ? raw.slice(0, limit) : raw;
  const pathOf = (r: Raw) => r.thumb_path ?? (r.mime?.startsWith("image/") ? r.file_path : null);
  const urls = limit === null ? {} : await signPaths(page.map(pathOf));

  const rows = page.map((r) => {
    const { thumb_path, file_path, mime, ...rest } = r;
    void thumb_path;
    void file_path;
    void mime;
    const path = pathOf(r);
    return { ...rest, thumbUrl: path ? urls[path] : undefined } as TrackerRow;
  });
  return { rows, hasMore };
}
