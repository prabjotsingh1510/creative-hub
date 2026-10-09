import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/session";
import { StatusBadge, TimelinessBadge } from "@/components/creatives/badges";
import { waitingStatuses } from "@/lib/filters";
import { describeActivity } from "@/lib/activity";
import { formatDateOnly, formatIST } from "@/lib/time";
import { STATUS_LABEL, STATUSES, type ActivityRow, type LiveState, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

interface Row {
  id: string;
  title: string;
  status: Status;
  live_state: LiveState;
  due_date: string | null;
  submitted_at: string | null;
  went_live_at: string | null;
  meta_preview_link: string | null;
  timing: string;
  deadline_at: string | null;
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const waitingStatusList = waitingStatuses(profile.role);
  const cols = "id,title,status,live_state,due_date,submitted_at,went_live_at,meta_preview_link,timing,deadline_at";
  const waitingFilter =
    profile.role === "admin"
      ? `status.in.(${waitingStatusList.join(",")}),timing.eq.overdue`
      : `status.in.(${waitingStatusList.join(",")})`;

  // Counts come from one database call; each list fetches only the 10-20 rows it shows.
  const [stats, waitingRes, overdueRes, liveRes, { data: activity }, { data: people }] = await Promise.all([
    supabase.rpc("dashboard_stats"),
    supabase.from("creatives_list").select(cols, { count: "exact" }).is("deleted_at", null).or(waitingFilter).order("due_date", { ascending: true, nullsFirst: false }).limit(10),
    supabase.from("creatives_list").select(cols, { count: "exact" }).is("deleted_at", null).eq("timing", "overdue").order("deadline_at", { ascending: true }).limit(10),
    supabase.from("creatives_list").select(cols).is("deleted_at", null).not("went_live_at", "is", null).order("went_live_at", { ascending: false }).limit(10),
    supabase.from("activity_log").select("*, creatives(title)").order("created_at", { ascending: false }).limit(20),
    supabase.from("profiles").select("id, name"),
  ]);
  const error = stats.error ?? waitingRes.error ?? overdueRes.error ?? liveRes.error;
  if (error) return <p role="alert" className="text-sm text-destructive">Couldn’t load the dashboard: {error.message}</p>;

  const s = stats.data as { by_status: Partial<Record<Status, number>>; overdue: number; live_now: number; went_live_7d: number };
  const names = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const waiting = (waitingRes.data ?? []) as unknown as Row[];
  const overdue = (overdueRes.data ?? []) as unknown as Row[];
  const recentlyLive = (liveRes.data ?? []) as unknown as Row[];
  const waitingLabel =
    profile.role === "admin" ? "Needs your review, plus overdue" : profile.role === "creative" ? "Requests and changes for you" : "Ready to go live";

  const stats_by_status = s.by_status;
  const feed = (activity ?? []) as (ActivityRow & { creatives: { title: string } | null })[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {profile.role === "ads"
          ? `Hey ${profile.name.split(" ")[0]}, Ready to take ads live?`
          : `Hi ${profile.name.split(" ")[0]}`}
      </h1>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Overdue" value={s.overdue} href="/creatives?timing=overdue&sort=due" tone={overdue.length ? "bad" : undefined} />
        <Stat label="Live now" value={s.live_now} href="/creatives?live=live&sort=live" tone="good" />
        <Stat label="Went live (7 days)" value={s.went_live_7d} href="/creatives?sort=live" />
        {STATUSES.map((st) => (
          <Stat key={st} label={STATUS_LABEL[st]} value={stats_by_status[st] ?? 0} href={`/creatives?status=${st}`} />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Waiting on me" hint={waitingLabel} count={waitingRes.count ?? waiting.length}>
          {waiting.length === 0 ? (
            <Empty>Nothing waiting on you. 🎉</Empty>
          ) : (
            waiting.map((r) => (
              <Item key={r.id} href={`/creatives/${r.id}`} title={r.title}>
                <StatusBadge status={r.status} />
                {r.timing === "overdue" && <TimelinessBadge due={r.due_date} submittedAt={r.submitted_at} />}
                <span className="text-xs text-muted-foreground">Due {formatDateOnly(r.due_date)}</span>
              </Item>
            ))
          )}
        </Panel>

        <Panel title="Overdue" hint="Past due date, nothing submitted — most overdue first" count={overdueRes.count ?? overdue.length}>
          {overdue.length === 0 ? (
            <Empty>Nothing overdue.</Empty>
          ) : (
            overdue.map((r) => (
              <Item key={r.id} href={`/creatives/${r.id}`} title={r.title}>
                <TimelinessBadge due={r.due_date} submittedAt={r.submitted_at} />
                <span className="text-xs text-muted-foreground">Due {formatDateOnly(r.due_date)}</span>
              </Item>
            ))
          )}
        </Panel>

        <Panel title="Recently live" hint="Last 10 to go live (IST)">
          {recentlyLive.length === 0 ? (
            <Empty>Nothing has gone live yet.</Empty>
          ) : (
            recentlyLive.map((r) => (
              <Item
                key={r.id}
                href={`/creatives/${r.id}`}
                title={r.title}
                action={
                  r.meta_preview_link ? (
                    <a href={r.meta_preview_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-xs underline">
                      Meta preview <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : undefined
                }
              >
                <span className="text-xs text-muted-foreground">{formatIST(r.went_live_at)}</span>
                {r.live_state !== "live" && <StatusBadge status={r.status} />}
              </Item>
            ))
          )}
        </Panel>

        <Panel title="Recent activity" hint="Last 20 events across all creatives">
          {feed.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            feed.map((a) => (
              <Item key={a.id} href={`/creatives/${a.creative_id}`} title={a.creatives?.title ?? "Creative"}>
                <span className="text-xs text-muted-foreground">
                  <b className="font-medium text-foreground">{names.get(a.actor_id ?? "") ?? "System"}</b> {describeActivity(a)} · {formatIST(a.created_at, "d MMM, h:mm a")}
                </span>
              </Item>
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number; href: string; tone?: "good" | "bad" }) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-3 transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 outline-none">
      <div className={cn("text-2xl font-semibold tabular-nums", tone === "bad" && value > 0 && "text-red-600 dark:text-red-400", tone === "good" && value > 0 && "text-green-600 dark:text-green-400")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Link>
  );
}

function Panel({ title, hint, count, children }: { title: string; hint?: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-baseline gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-muted px-2 text-xs tabular-nums">{count}</span>}
        {hint && <span className="ml-auto truncate text-xs text-muted-foreground">{hint}</span>}
      </header>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

function Item({ href, title, children, action }: { href: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 pr-4 hover:bg-muted">
      <Link href={href} className="block min-w-0 flex-1 px-4 py-2.5 text-sm">
        <span className="block truncate font-medium">{title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">{children}</span>
      </Link>
      {action}
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</li>;
}
