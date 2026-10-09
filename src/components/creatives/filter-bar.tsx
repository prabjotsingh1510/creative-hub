"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Columns3, LayoutGrid, Search, SlidersHorizontal, Table2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  SORT_LABEL,
  TIMING_LABEL,
  filtersToParams,
  hasActiveFilters,
  isQuickFilterActive,
  quickFilters,
  type ListFilters,
  type SortKey,
  type Timing,
} from "@/lib/filters";
import { LIVE_LABEL, STATUSES, STATUS_LABEL, type Format, type LiveState, type Role, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** All state lives in the URL, so views are shareable and survive refresh. */
export function FilterBar({
  filters,
  role,
  campaigns,
  uploaders,
  total,
  totalIsLowerBound,
}: {
  filters: ListFilters;
  role: Role;
  campaigns: string[];
  uploaders: { id: string; name: string }[];
  total: number;
  totalIsLowerBound?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(filters.q);
  const first = useRef(true);

  const href = (patch: Partial<ListFilters>) => `/creatives?${filtersToParams({ ...filters, ...patch }).toString()}`;
  const go = (patch: Partial<ListFilters>) => router.push(href(patch));

  useEffect(() => setQ(filters.q), [filters.q]);
  // Debounced live search (also submits on Enter).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (q.trim() === filters.q) return;
    const t = setTimeout(() => router.replace(href({ q: q.trim() })), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = hasActiveFilters(filters);
  const quick = quickFilters(role);
  const statusValue = filters.status.length === 1 ? filters.status[0] : filters.status.length ? "multi" : "";
  const liveValue = filters.live.length === 1 ? filters.live[0] : filters.live.length ? "multi" : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="relative min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() });
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search creatives"
            placeholder="Search title, campaign, brief, notes, comments…"
            className="h-9 pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <select aria-label="Sort by" className={cn(selectCls, "w-auto")} value={filters.sort} onChange={(e) => go({ sort: e.target.value as SortKey })}>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted", open && "bg-muted")}
        >
          <SlidersHorizontal className="size-4" aria-hidden /> Filters
        </button>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="View">
          <Link href={href({ view: "grid" })} aria-label="Grid view" className={cn("rounded-md p-1.5", filters.view === "grid" && "bg-muted")}>
            <LayoutGrid className="size-4" />
          </Link>
          <Link href={href({ view: "table" })} aria-label="Table view" className={cn("rounded-md p-1.5", filters.view === "table" && "bg-muted")}>
            <Table2 className="size-4" />
          </Link>
          <Link href={href({ view: "kanban" })} aria-label="Board view" className={cn("rounded-md p-1.5", filters.view === "kanban" && "bg-muted")}>
            <Columns3 className="size-4" />
          </Link>
        </div>
      </div>

      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label="Quick filters">
        {quick.map((qf) => {
          const on = isQuickFilterActive(filters, qf);
          return (
            <Link
              key={qf.key}
              href={on ? href({ ...clearAll(filters), view: filters.view }) : `/creatives?${filtersToParams({ ...qf.filters, view: filters.view }).toString()}`}
              aria-current={on ? "true" : undefined}
              className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
            >
              {qf.label}
            </Link>
          );
        })}
        {role === "admin" && (
          <Link
            href={href({ deleted: !filters.deleted })}
            aria-current={filters.deleted ? "true" : undefined}
            className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", filters.deleted ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
          >
            Deleted
          </Link>
        )}
        {active && (
          <Link href={`/creatives?${filtersToParams({ view: filters.view, sort: filters.sort }).toString()}`} className="ml-1 inline-flex shrink-0 items-center gap-1 text-xs underline">
            <X className="size-3" aria-hidden /> Clear filters
          </Link>
        )}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground" aria-live="polite">
          {total}{totalIsLowerBound ? "+" : ""} result{total === 1 && !totalIsLowerBound ? "" : "s"}
        </span>
      </div>

      {open && (
        <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status">
            <select className={selectCls} value={statusValue} onChange={(e) => go({ status: e.target.value ? [e.target.value as Status] : [] })}>
              <option value="">Any</option>
              {statusValue === "multi" && <option value="multi" disabled>Multiple (quick filter)</option>}
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Live state">
            <select className={selectCls} value={liveValue} onChange={(e) => go({ live: e.target.value ? [e.target.value as LiveState] : [] })}>
              <option value="">Any</option>
              {liveValue === "multi" && <option value="multi" disabled>Multiple</option>}
              {(Object.keys(LIVE_LABEL) as LiveState[]).map((s) => <option key={s} value={s}>{LIVE_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Format">
            <select className={selectCls} value={filters.format} onChange={(e) => go({ format: e.target.value as Format | "" })}>
              <option value="">Any</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="carousel">Carousel</option>
            </select>
          </Field>
          <Field label="Campaign">
            <select className={selectCls} value={filters.campaign} onChange={(e) => go({ campaign: e.target.value })}>
              <option value="">Any</option>
              {campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Uploaded by">
            <select className={selectCls} value={filters.uploader} onChange={(e) => go({ uploader: e.target.value })}>
              <option value="">Anyone</option>
              {uploaders.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Timing">
            <select className={selectCls} value={filters.timing} onChange={(e) => go({ timing: e.target.value as Timing | "" })}>
              <option value="">Any</option>
              {(Object.keys(TIMING_LABEL) as Timing[]).map((t) => <option key={t} value={t}>{TIMING_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Due from"><input type="date" className={selectCls} value={filters.dueFrom} onChange={(e) => go({ dueFrom: e.target.value })} /></Field>
          <Field label="Due to"><input type="date" className={selectCls} value={filters.dueTo} onChange={(e) => go({ dueTo: e.target.value })} /></Field>
          <Field label="Submitted from"><input type="date" className={selectCls} value={filters.subFrom} onChange={(e) => go({ subFrom: e.target.value })} /></Field>
          <Field label="Submitted to"><input type="date" className={selectCls} value={filters.subTo} onChange={(e) => go({ subTo: e.target.value })} /></Field>
        </div>
      )}
    </div>
  );
}

const clearAll = (f: ListFilters): Partial<ListFilters> => ({
  q: f.q,
  status: [],
  live: [],
  campaign: "",
  format: "",
  uploader: "",
  dueFrom: "",
  dueTo: "",
  subFrom: "",
  subTo: "",
  timing: "",
  deleted: false,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
