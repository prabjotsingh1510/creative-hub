import Link from "next/link";
import { LayoutGrid, Plus, Table2, ImageOff, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, signPaths } from "@/lib/session";
import { canCreateRequest } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { LiveBadge, StatusBadge, TimelinessBadge } from "@/components/creatives/badges";
import { formatDateOnly } from "@/lib/time";
import { STATUSES, STATUS_LABEL, type Creative, type CreativeVersion, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Creatives" };

type Row = Creative & { current: Pick<CreativeVersion, "thumb_path" | "file_path" | "mime" | "version_no"> | null };

export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; deleted?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const view = sp.view === "table" ? "table" : "grid";
  const status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : null;
  const showDeleted = profile.role === "admin" && sp.deleted === "1";

  const supabase = await createClient();
  let q = supabase
    .from("creatives")
    .select("*, current:creative_versions!creatives_current_version_fk(thumb_path,file_path,mime,version_no)")
    .order("created_at", { ascending: false });
  q = showDeleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as Row[];

  const urls = await signPaths(rows.map((r) => r.current?.thumb_path ?? (r.current?.mime.startsWith("image/") ? r.current.file_path : null)));
  const thumbOf = (r: Row) =>
    r.current ? urls[r.current.thumb_path ?? (r.current.mime.startsWith("image/") ? r.current.file_path : "")] : undefined;

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { view, status, deleted: showDeleted ? "1" : null, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/creatives?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Creatives</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="View">
            <Link href={href({ view: "grid" })} aria-label="Grid view" className={cn("rounded-md p-1.5", view === "grid" && "bg-muted")}>
              <LayoutGrid className="size-4" />
            </Link>
            <Link href={href({ view: "table" })} aria-label="Table view" className={cn("rounded-md p-1.5", view === "table" && "bg-muted")}>
              <Table2 className="size-4" />
            </Link>
          </div>
          {canCreateRequest(profile.role) && (
            <Link href="/creatives/new">
              <Button size="lg"><Plus /> New request</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by status">
        <Chip href={href({ status: null })} active={!status}>All</Chip>
        {STATUSES.map((s) => (
          <Chip key={s} href={href({ status: s })} active={status === s}>{STATUS_LABEL[s]}</Chip>
        ))}
        {profile.role === "admin" && (
          <Chip href={href({ deleted: showDeleted ? null : "1" })} active={showDeleted}>Deleted</Chip>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">Couldn’t load creatives: {error.message}</p>}

      {!error && rows.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {status || showDeleted ? "No creatives match this filter." : "No creatives yet."}
          {canCreateRequest(profile.role) && !status && !showDeleted && " Create a request to get started."}
        </div>
      )}

      {view === "grid" ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/creatives/${r.id}`} className="group block overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 outline-none">
                <div className="relative aspect-[4/3] bg-muted">
                  <Thumb url={thumbOf(r)} format={r.format} />
                  {r.current && r.current.version_no > 1 && (
                    <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">v{r.current.version_no}</span>
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
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs",
        active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </Link>
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
