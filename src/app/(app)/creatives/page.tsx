import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/session";
import { canCreateRequest } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/creatives/filter-bar";
import { CreativeList } from "@/components/creatives/creative-list";
import { KanbanBoard } from "@/components/creatives/kanban-board";
import { KANBAN_LIMIT, PAGE_SIZE, loadCreativeCards } from "@/lib/creatives-data";
import { filtersToParams, hasActiveFilters, parseFilters } from "@/lib/filters";

export const metadata = { title: "Creatives" };

export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilters(await searchParams);
  const profile = await requireProfile();
  const filters = profile.role === "admin" ? f : { ...f, deleted: false };
  const supabase = await createClient();
  const kanban = filters.view === "kanban";

  const [{ rows, hasMore, error }, { data: campaignRows }, { data: people }] = await Promise.all([
    loadCreativeCards(filters, { limit: kanban ? KANBAN_LIMIT : PAGE_SIZE }),
    supabase.from("creatives").select("campaign").not("campaign", "is", null).is("deleted_at", null),
    supabase.from("profiles").select("id, name, role").in("role", ["admin", "creative"]).eq("active", true),
  ]);
  const campaigns = [...new Set((campaignRows ?? []).map((r) => r.campaign as string))].sort();
  const active = hasActiveFilters(filters);
  // Query string without view/offset: the list re-fetches pages with the same filters.
  const queryString = filtersToParams({ ...filters, view: "grid" }).toString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Creatives</h1>
        {profile.role === "admin" && (
          <a href="/api/admin/export" download className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted">
            <Download className="size-4" aria-hidden /> Export CSV
          </a>
        )}
        {canCreateRequest(profile.role) && (
          <Link href="/creatives/new" className={profile.role === "admin" ? "" : "ml-auto"}>
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
        totalIsLowerBound={hasMore}
      />

      {error && <p role="alert" className="text-sm text-destructive">Couldn’t load creatives: {error}</p>}

      {!error && rows.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {active ? "No creatives match these filters." : "No creatives yet."}
          {canCreateRequest(profile.role) && !active && " Create a request to get started."}
        </div>
      )}

      {rows.length > 0 &&
        (kanban ? (
          <KanbanBoard initial={rows} role={profile.role} truncated={hasMore} />
        ) : (
          <CreativeList key={`${queryString}|${filters.view}`} initial={rows} hasMore={hasMore} view={filters.view as "grid" | "table"} queryString={queryString} pageSize={PAGE_SIZE} />
        ))}
    </div>
  );
}
