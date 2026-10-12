import Link from "next/link";
import { Download } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/session";
import { TZ } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrackerTable } from "@/components/tracker/tracker-table";
import {
  TRACKER_PAGE_SIZE,
  loadTrackerRows,
  parseTrackerFilters,
  trackerFiltersToParams,
} from "@/lib/tracker-data";

export const metadata = { title: "Ads Tracker" };

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Last 12 calendar months (IST), newest first, as YYYY-MM values. */
function recentMonths() {
  const now = new Date();
  const [y, m] = formatInTimeZone(now, TZ, "yyyy-M").split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { value, label: d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) };
  });
}

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseTrackerFilters(await searchParams);
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ rows, hasMore, error }, { data: facets }] = await Promise.all([
    loadTrackerRows(filters, { limit: TRACKER_PAGE_SIZE }),
    supabase.from("creatives").select("campaign, product_advertised").is("deleted_at", null),
  ]);
  const uniq = (key: "campaign" | "product_advertised") =>
    [...new Set((facets ?? []).map((r) => r[key] as string | null).filter((v): v is string => !!v))].sort();
  const campaigns = uniq("campaign");
  const products = uniq("product_advertised");
  const params = trackerFiltersToParams(filters);
  const queryString = params.toString();
  const active = queryString.length > 0;
  const canExport = profile.role === "admin" || profile.role === "ads";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-semibold">Ads Tracker</h1>
          <p className="text-xs text-muted-foreground">Every creative with its ad details. Most recently updated first.</p>
        </div>
        {canExport && (
          <a
            href={`/api/tracker/export${queryString ? `?${queryString}` : ""}`}
            download
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted"
          >
            <Download className="size-4" aria-hidden /> Export CSV
          </a>
        )}
      </div>

      {/* Plain GET form: filters live in the URL and need no client JS. */}
      <form method="get" className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7" role="search" aria-label="Filter tracker">
        <Input name="q" defaultValue={filters.q} placeholder="Search name, ad, campaign…" aria-label="Search" className="col-span-2 md:col-span-4 lg:col-span-2" />
        <select name="month" defaultValue={filters.month} aria-label="Month" className={selectCls}>
          <option value="">All months</option>
          {recentMonths().map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select name="product" defaultValue={filters.product} aria-label="Product" className={selectCls}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select name="campaign" defaultValue={filters.campaign} aria-label="Campaign" className={selectCls}>
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select name="media" defaultValue={filters.media} aria-label="Media type" className={selectCls}>
          <option value="">All media</option>
          <option value="video">Video</option>
          <option value="image">Static</option>
          <option value="carousel">Carousel</option>
        </select>
        <select name="live" defaultValue={filters.live} aria-label="Meta status" className={selectCls}>
          <option value="">Any Meta status</option>
          <option value="live">Active</option>
          <option value="paused">Inactive / paused</option>
          <option value="rejected">Rejected</option>
          <option value="not_live">Not live</option>
        </select>
        <select name="asset" defaultValue={filters.asset} aria-label="Asset type" className={selectCls}>
          <option value="">Inhouse + Parent</option>
          <option value="inhouse">Inhouse</option>
          <option value="parent">Parent</option>
        </select>
        <div className="col-span-2 flex gap-2 md:col-span-4 lg:col-span-1">
          <Button type="submit" className="flex-1">Apply</Button>
          {active && (
            <Link href="/tracker" className="inline-flex h-9 items-center rounded-lg border px-3 text-sm hover:bg-muted">
              Clear
            </Link>
          )}
        </div>
      </form>

      {error && <p role="alert" className="text-sm text-destructive">Couldn’t load the tracker: {error}</p>}

      {!error && rows.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {active ? "No creatives match these filters." : "No creatives yet."}
        </div>
      )}

      {rows.length > 0 && (
        <TrackerTable key={queryString} initial={rows} hasMore={hasMore} queryString={queryString} pageSize={TRACKER_PAGE_SIZE} />
      )}
    </div>
  );
}
