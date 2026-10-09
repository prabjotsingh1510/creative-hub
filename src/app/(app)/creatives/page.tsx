import Link from "next/link";
import { Plus, ImageOff, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, signPaths } from "@/lib/session";
import { canCreateRequest } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/creatives/filter-bar";
import { LiveBadge, StatusBadge, TimelinessBadge } from "@/components/creatives/badges";
import { formatDateOnly } from "@/lib/time";
import { hasActiveFilters, parseFilters, sanitizeSearch } from "@/lib/filters";
import type { Creative } from "@/lib/types";

export const metadata = { title: "Creatives" };

type Row = Creative & {
  thumb_path: string | null;
  file_path: string | null;
  mime: string | null;
  version_no: number | null;
};

export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilters(await searchParams);
  const profile = await requireProfile();
  const filters = profile.role === "admin" ? f : { ...f, deleted: false };
  const supabase = await createClient();

  // Free-text search (title, campaign, brief, notes, comments) resolves to ids first.
  let searchIds: string[] | null = null;
  const term = sanitizeSearch(filters.q);
  if (term) {
    const { data } = await supabase.rpc("search_creative_ids", { q: term });
    searchIds = (data ?? []) as string[];
  }

  let q = supabase.from("creatives_list").select("*");
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
  if (searchIds) q = q.in("id", searchIds.length ? searchIds : ["00000000-0000-0000-0000-000000000000"]);
  q =
    filters.sort === "due"
      ? q.order("due_date", { ascending: true, nullsFirst: false })
      : filters.sort === "updated"
        ? q.order("updated_at", { ascending: false })
        : filters.sort === "live"
          ? q.order("went_live_at", { ascending: false, nullsFirst: false })
          : q.order("created_at", { ascending: false });
  q = q.limit(200);

  const [{ data, error }, { data: campaignRows }, { data: people }] = await Promise.all([
    q,
    supabase.from("creatives").select("campaign").not("campaign", "is", null).is("deleted_at", null),
    supabase.from("profiles").select("id, name, role").in("role", ["admin", "creative"]).eq("active", true),
  ]);
  const rows = (data ?? []) as Row[];
  const campaigns = [...new Set((campaignRows ?? []).map((r) => r.campaign as string))].sort();

  const urls = await signPaths(rows.map((r) => r.thumb_path ?? (r.mime?.startsWith("image/") ? r.file_path : null)));
  const thumbOf = (r: Row) => urls[r.thumb_path ?? (r.mime?.startsWith("image/") ? (r.file_path ?? "") : "")];
  const active = hasActiveFilters(filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Creatives</h1>
        {canCreateRequest(profile.role) && (
          <Link href="/creatives/new" className="ml-auto">
            <Button size="lg"><Plus /> New request</Button>
          </Link>
        )}
      </div>

      <FilterBar
        filters={filters}
        role={profile.role}
        campaigns={campaigns}
        uploaders={(people ?? []).map((p) => ({ id: p.id as string, name: p.name as string }))}
        total={rows.length}
      />

      {error && <p role="alert" className="text-sm text-destructive">Couldn’t load creatives: {error.message}</p>}

      {!error && rows.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {active ? "No creatives match these filters." : "No creatives yet."}
          {canCreateRequest(profile.role) && !active && " Create a request to get started."}
        </div>
      )}

      {filters.view === "grid" ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/creatives/${r.id}`} className="group block overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 outline-none">
                <div className="relative aspect-[4/3] bg-muted">
                  <Thumb url={thumbOf(r)} format={r.format} />
                  {r.version_no && r.version_no > 1 && (
                    <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">v{r.version_no}</span>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <h2 className="line-clamp-1 font-medium">{r.title}</h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={r.status} />
                    <LiveBadge state={r.live_state} />
                    <TimelinessBadge due={r.due_date} submittedAt={r.submitted_at} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Due {formatDateOnly(r.due_date)}{r.campaign ? ` · ${r.campaign}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        rows.length > 0 && (
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
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      <Link href={`/creatives/${r.id}`} className="flex items-center gap-3">
                        <span className="relative block size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                          <Thumb url={thumbOf(r)} format={r.format} small />
                        </span>
                        <span>
                          <span className="block font-medium">{r.title}</span>
                          <span className="text-xs text-muted-foreground">{r.campaign ?? r.format}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="p-2"><StatusBadge status={r.status} /></td>
                    <td className="p-2 whitespace-nowrap">{formatDateOnly(r.due_date)}</td>
                    <td className="p-2"><TimelinessBadge due={r.due_date} submittedAt={r.submitted_at} /></td>
                    <td className="p-2"><LiveBadge state={r.live_state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {rows.length === 200 && <p className="text-xs text-muted-foreground">Showing the first 200 results. Narrow the filters to see more.</p>}
    </div>
  );
}

function Thumb({ url, format, small }: { url?: string; format: string; small?: boolean }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" loading="lazy" className="size-full object-cover" />;
  }
  const Icon = format === "video" ? Film : ImageOff;
  return (
    <span className="flex size-full items-center justify-center text-muted-foreground">
      <Icon className={small ? "size-5" : "size-8"} aria-hidden />
    </span>
  );
}
