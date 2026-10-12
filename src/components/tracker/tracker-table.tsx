"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Thumb } from "@/components/creatives/creative-cards";
import { LiveBadge, StatusBadge } from "@/components/creatives/badges";
import {
  ASSET_TYPE_LABEL,
  MEDIA_LABEL,
  sheetDate,
  sheetMonth,
  statusChangedTo,
  yesNoLabel,
  type TrackerRow,
} from "@/lib/tracker";

const Dash = () => <span className="text-muted-foreground">—</span>;
const text = (v: string | null | undefined) => (v ? v : <Dash />);
const date = (v: string | null | undefined) => (v ? sheetDate(v) : <Dash />);
const yn = (v: boolean | null) => (v === null ? <Dash /> : yesNoLabel(v));

function ext(href: string | null, label = "Open") {
  if (!href) return <Dash />;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
      {label} <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

/** Clamped multi-word cell; full value is on hover/long-press via title. */
const clamp = (v: string | null, w = "w-56") =>
  v ? (
    <span title={v} className={`line-clamp-2 block whitespace-normal break-words ${w}`}>
      {v}
    </span>
  ) : (
    <Dash />
  );

interface Col {
  key: string;
  header: string;
  cell: (r: TrackerRow) => ReactNode;
  className?: string;
}

// Same order as the sheet. S.NO. and the creative itself are rendered separately (sticky).
const COLUMNS: Col[] = [
  { key: "campaign", header: "Campaign", cell: (r) => text(r.campaign) },
  { key: "product", header: "Product Advertised", cell: (r) => text(r.product_advertised) },
  { key: "month", header: "Month", cell: (r) => sheetMonth(r) },
  { key: "shared", header: "Asset Shared Date", cell: (r) => date(r.submitted_at) },
  { key: "meta", header: "Meta Ads Link", cell: (r) => ext(r.meta_preview_link) },
  { key: "caption", header: "Caption", cell: (r) => clamp(r.caption, "w-64") },
  { key: "platform", header: "Platform", cell: (r) => r.platform },
  { key: "media", header: "Media Type", cell: (r) => MEDIA_LABEL[r.format] },
  { key: "asset", header: "Asset Type", cell: (r) => (r.asset_type ? ASSET_TYPE_LABEL[r.asset_type] : <Dash />) },
  { key: "creator", header: "Creator Name", cell: (r) => text(r.creator_name) },
  { key: "ig", header: "Instagram Handle", cell: (r) => text(r.instagram_handle) },
  { key: "adname", header: "AD Name", cell: (r) => clamp(r.ad_name, "w-60") },
  { key: "campname", header: "Campaign Name", cell: (r) => clamp(r.meta_campaign_name, "w-56") },
  { key: "adset", header: "Ad set Name", cell: (r) => clamp(r.ad_set_name, "w-56") },
  { key: "partner", header: "Partnership Ad", cell: (r) => yn(r.partnership_ad) },
  { key: "lang", header: "Language", cell: (r) => text(r.language) },
  { key: "face", header: "Face in First 3 Sec", cell: (r) => yn(r.face_in_first_3s) },
  { key: "audio", header: "Audio Hook in first 3 Sec", cell: (r) => yn(r.audio_hook_first_3s) },
  { key: "texthook", header: "Text in first 3 Sec", cell: (r) => yn(r.text_in_first_3s) },
  { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  { key: "golive", header: "Go-live Date", cell: (r) => date(r.went_live_at) },
  { key: "live", header: "Live Status", cell: (r) => (r.live_state === "live" ? "Yes" : "No") },
  {
    key: "onmeta",
    header: "Current Status on Meta",
    cell: (r) => (r.live_state === "not_live" ? <Dash /> : <LiveBadge state={r.live_state} />),
  },
  { key: "changedto", header: "Status changed to", cell: (r) => text(statusChangedTo(r.live_state)) },
  { key: "changedon", header: "Last Status changed on", cell: (r) => date(r.meta_status_changed_at) },
  { key: "reason", header: "Reason if Paused", cell: (r) => clamp(r.pause_reason, "w-48") },
  { key: "edited", header: "Last Edited Date", cell: (r) => date(r.updated_at) },
  { key: "lp", header: "Landing Page URL", cell: (r) => ext(r.landing_page_url) },
  { key: "lptype", header: "Landing Page Type", cell: (r) => text(r.landing_page_type) },
  { key: "cta", header: "CTA Used", cell: (r) => text(r.cta_used) },
  { key: "comments", header: "Comments", cell: (r) => clamp(r.tracker_comments, "w-56") },
];

/** The tracker grid: creative preview pinned on the left, newest-updated row first, "load more" on scroll. */
export function TrackerTable({
  initial,
  hasMore: initialHasMore,
  queryString,
  pageSize,
}: {
  initial: TrackerRow[];
  hasMore: boolean;
  queryString: string;
  pageSize: number;
}) {
  const [rows, setRows] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracker?${queryString}&offset=${rows.length}`);
      if (!res.ok) throw new Error("Couldn’t load more rows.");
      const data = (await res.json()) as { rows: TrackerRow[]; hasMore: boolean };
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...data.rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t load more rows.");
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, queryString, rows.length]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || error) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && void loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, error]);

  return (
    <>
      <div className="max-h-[calc(100dvh-14rem)] overflow-auto rounded-xl border">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="sticky left-0 top-0 z-30 w-14 border-b bg-muted p-2 font-medium">S.NO.</th>
              <th className="sticky left-14 top-0 z-30 min-w-64 border-b border-r bg-muted p-2 font-medium">Creative / Asset Name</th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className="sticky top-0 z-20 whitespace-nowrap border-b bg-muted p-2 font-medium">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="group hover:bg-muted/30">
                <td className="sticky left-0 z-10 border-b bg-background p-2 tabular-nums text-muted-foreground group-hover:bg-muted">{r.sno}</td>
                <td className="sticky left-14 z-10 border-b border-r bg-background p-2 group-hover:bg-muted">
                  <Link href={`/creatives/${r.id}`} className="flex items-center gap-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <span className="relative block size-20 shrink-0 overflow-hidden rounded-md bg-muted">
                      <Thumb url={r.thumbUrl} format={r.format} small />
                      {r.version_no && r.version_no > 1 && (
                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">v{r.version_no}</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 block font-medium">{r.title}</span>
                      <span className="text-xs text-muted-foreground">{MEDIA_LABEL[r.format]}</span>
                    </span>
                  </Link>
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="whitespace-nowrap border-b p-2 align-middle">
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div ref={sentinel} className="flex justify-center py-4" aria-live="polite">
        {error ? (
          <div className="text-center text-sm">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" className="mt-2" onClick={() => void loadMore()}>Try again</Button>
          </div>
        ) : hasMore ? (
          <Button variant="outline" disabled={loading} onClick={() => void loadMore()}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        ) : rows.length >= pageSize ? (
          <p className="text-xs text-muted-foreground">You’ve reached the end.</p>
        ) : null}
      </div>
    </>
  );
}
