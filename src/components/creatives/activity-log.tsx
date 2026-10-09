"use client";

import { useState } from "react";
import { toast } from "sonner";
import { loadMoreActivity } from "@/actions/pagination";
import { Button } from "@/components/ui/button";
import { cursorOf, type Cursor } from "@/lib/cursor";
import { ACTIVITY_GROUPS, activityGroupOf, describeActivity, type ActivityGroup } from "@/lib/activity";
import { formatIST } from "@/lib/time";
import type { ActivityRow, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Immutable timeline for one creative, filterable by event type. */
export function ActivityLog({
  creativeId,
  rows: initial,
  people,
  hasMore: initialHasMore,
}: {
  creativeId: string;
  rows: ActivityRow[];
  people: Pick<Profile, "id" | "name">[];
  hasMore: boolean;
}) {
  const [extra, setExtra] = useState<ActivityRow[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const rows = [...initial, ...extra.filter((e) => !initial.some((i) => i.id === e.id))];
  async function more() {
    const last = rows[rows.length - 1];
    if (!last || loading) return;
    setLoading(true);
    const cursor: Cursor = cursorOf(last);
    const res = await loadMoreActivity(creativeId, cursor);
    setLoading(false);
    if (!res.ok) return void toast.error(res.error);
    setExtra((p) => [...p, ...res.rows]);
    setHasMore(res.hasMore);
  }
  const [group, setGroup] = useState<ActivityGroup | "all">("all");
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "System";
  const present = new Set(rows.map((r) => activityGroupOf(r.action)));
  const shown = group === "all" ? rows : rows.filter((r) => activityGroupOf(r.action) === group);

  return (
    <section aria-labelledby="activity-h" className="rounded-xl border bg-card p-4">
      <h2 id="activity-h" className="mb-3 text-sm font-semibold">Timeline</h2>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by event type">
        {[{ key: "all" as const, label: "All" }, ...ACTIVITY_GROUPS.filter((g) => present.has(g.key))].map((g) => (
          <button
            key={g.key}
            type="button"
            aria-pressed={group === g.key}
            onClick={() => setGroup(g.key)}
            className={cn("rounded-full border px-2.5 py-0.5 text-xs", group === g.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
          >
            {g.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ol className="max-h-[520px] space-y-3 overflow-y-auto border-l pl-4 text-sm">
          {shown.map((a) => (
            <li key={a.id} className="relative">
              <span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-border" />
              <span className="font-medium">{name(a.actor_id)}</span> {describeActivity(a)}
              <div className="text-xs text-muted-foreground">{formatIST(a.created_at)}</div>
            </li>
          ))}
        </ol>
      )}
      {hasMore && group === "all" && (
        <Button type="button" variant="outline" className="mt-3 w-full" disabled={loading} onClick={() => void more()}>
          {loading ? "Loading…" : "Load older activity"}
        </Button>
      )}
    </section>
  );
}
