"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CreativeCard, CreativeTableRow } from "@/components/creatives/creative-cards";
import type { CardRow } from "@/lib/creatives-data";

/** Grid/table with "load more" (auto-loads when scrolled near the end). Remount with `key` when filters change. */
export function CreativeList({
  initial,
  hasMore: initialHasMore,
  view,
  queryString,
  pageSize,
}: {
  initial: CardRow[];
  hasMore: boolean;
  view: "grid" | "table";
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
      const res = await fetch(`/api/creatives?${queryString}&offset=${rows.length}`);
      if (!res.ok) throw new Error("Couldn’t load more creatives.");
      const data = (await res.json()) as { rows: CardRow[]; hasMore: boolean };
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...data.rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t load more creatives.");
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
      {view === "grid" ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((r) => (
            <li key={r.id}>
              <CreativeCard row={r} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Creative</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Due</th>
                <th className="p-2 font-medium">Timing</th>
                <th className="p-2 font-medium">Live</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <CreativeTableRow key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div ref={sentinel} className="flex justify-center py-4" aria-live="polite">
        {error ? (
          <div className="text-center text-sm">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" className="mt-2" onClick={() => void loadMore()}>Try again</Button>
          </div>
        ) : hasMore ? (
          <Button variant="outline" disabled={loading} onClick={() => void loadMore()}>
            {loading ? "Loading…" : `Load more`}
          </Button>
        ) : rows.length >= pageSize ? (
          <p className="text-xs text-muted-foreground">You’ve reached the end.</p>
        ) : null}
      </div>
    </>
  );
}
