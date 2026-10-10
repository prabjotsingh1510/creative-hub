import { LIVE_LABEL, STATUSES, type Format, type LiveState, type Role, type Status } from "./types";

/** Creatives-list filter state. Lives entirely in URL query params so views are shareable. */
export type SortKey = "newest" | "due" | "updated" | "live";
export type Timing = "on_time" | "late" | "overdue";

export interface ListFilters {
  q: string;
  status: Status[];
  live: LiveState[];
  campaign: string;
  format: Format | "";
  uploader: string;
  dueFrom: string;
  dueTo: string;
  subFrom: string;
  subTo: string;
  timing: Timing | "";
  sort: SortKey;
  view: "grid" | "table" | "kanban";
  deleted: boolean;
}

export const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest",
  due: "Due date",
  updated: "Recently updated",
  live: "Recently went live",
};

export const TIMING_LABEL: Record<Timing, string> = {
  on_time: "On time",
  late: "Submitted late",
  overdue: "Overdue (not submitted)",
};

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const list = <T extends string>(v: string, allowed: readonly T[]) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));

export function parseFilters(sp: Params): ListFilters {
  const sort = first(sp.sort) as SortKey;
  const timing = first(sp.timing) as Timing;
  const format = first(sp.format) as Format;
  return {
    q: first(sp.q).trim().slice(0, 100),
    status: list(first(sp.status), STATUSES),
    live: list(first(sp.live), Object.keys(LIVE_LABEL) as LiveState[]),
    campaign: first(sp.campaign).slice(0, 120),
    format: ["image", "video", "carousel"].includes(format) ? format : "",
    uploader: isUuid(first(sp.uploader)) ? first(sp.uploader) : "",
    dueFrom: isDate(first(sp.dueFrom)) ? first(sp.dueFrom) : "",
    dueTo: isDate(first(sp.dueTo)) ? first(sp.dueTo) : "",
    subFrom: isDate(first(sp.subFrom)) ? first(sp.subFrom) : "",
    subTo: isDate(first(sp.subTo)) ? first(sp.subTo) : "",
    timing: ["on_time", "late", "overdue"].includes(timing) ? timing : "",
    sort: ["newest", "due", "updated", "live"].includes(sort) ? sort : "newest",
    view: first(sp.view) === "table" ? "table" : first(sp.view) === "kanban" ? "kanban" : "grid",
    deleted: first(sp.deleted) === "1",
  };
}

/** Serialises only non-default values so URLs stay short. */
export function filtersToParams(f: Partial<ListFilters>): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.status?.length) p.set("status", f.status.join(","));
  if (f.live?.length) p.set("live", f.live.join(","));
  if (f.campaign) p.set("campaign", f.campaign);
  if (f.format) p.set("format", f.format);
  if (f.uploader) p.set("uploader", f.uploader);
  if (f.dueFrom) p.set("dueFrom", f.dueFrom);
  if (f.dueTo) p.set("dueTo", f.dueTo);
  if (f.subFrom) p.set("subFrom", f.subFrom);
  if (f.subTo) p.set("subTo", f.subTo);
  if (f.timing) p.set("timing", f.timing);
  if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
  if (f.view === "table" || f.view === "kanban") p.set("view", f.view);
  if (f.deleted) p.set("deleted", "1");
  return p;
}

/** True when any filter that narrows results is set (view/sort don't count). */
export function hasActiveFilters(f: ListFilters): boolean {
  return Boolean(
    f.q || f.status.length || f.live.length || f.campaign || f.format || f.uploader ||
      f.dueFrom || f.dueTo || f.subFrom || f.subTo || f.timing || f.deleted,
  );
}

/** Statuses that need this role's action ("Waiting on me"). */
export function waitingStatuses(role: Role): Status[] {
  if (role === "admin") return ["submitted"];
  if (role === "creative") return ["requested", "changes_requested"];
  return ["approved", "sent_to_ads"];
}

export interface QuickFilter {
  key: string;
  label: string;
  filters: Partial<ListFilters>;
}

export function quickFilters(role: Role): QuickFilter[] {
  return [
    { key: "waiting", label: "Waiting on me", filters: { status: waitingStatuses(role) } },
    { key: "overdue", label: "Overdue", filters: { timing: "overdue", sort: "due" } },
    { key: "late", label: "Late", filters: { timing: "late" } },
    { key: "live", label: "Live now", filters: { live: ["live"], sort: "live" } },
  ];
}

export function isQuickFilterActive(f: ListFilters, q: QuickFilter): boolean {
  const target = filtersToParams({ ...q.filters, view: f.view });
  const current = filtersToParams({ ...f, q: "", sort: q.filters.sort ?? "newest", view: f.view });
  return target.toString() === current.toString();
}

/** Escapes characters that are special in PostgREST `or(...)` / ilike values. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[\\%_,()]/g, " ").trim();
}
