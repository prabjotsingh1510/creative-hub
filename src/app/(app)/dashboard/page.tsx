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

const SEVEN_DAYS = 7 * 24 * 3600_000;

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data, error }, { data: activity }, { data: people }] = await Promise.all([
    supabase
      .from("creatives_list")
      .select("id,title,status,live_state,due_date,submitted_at,went_live_at,meta_preview_link,timing,deadline_at")
      .is("deleted_at", null),
    supabase
      .from("activity_log")
      .select("*, creatives(title)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("id, name"),
  ]);
  if (error) return <p role="alert" className="text-sm text-destructive">Couldn’t load the dashboard: {error.message}</p>;

  const rows = (data ?? []) as Row[];
  const names = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const now = Date.now();

  const byStatus = new Map<Status, number>();
  rows.forEach((r) => byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1));

  const overdue = rows
    .filter((r) => r.timing === "overdue")
    .sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime());
  const liveNow = rows.filter((r) => r.live_state === "live").length;
  const recentWindow = rows.filter((r) => r.went_live_at && now - new Date(r.went_live_at).getTime() <= SEVEN_DAYS).length;
  const recentlyLive = rows
    .filter((r) => r.went_live_at)
    .sort((a, b) => new Date(b.went_live_at!).getTime() - new Date(a.went_live_at!).getTime())
    .slice(0, 10);

  const waitingSet = new Set<Status>(waitingStatuses(profile.role));
  const waiting = rows.filter((r) => waitingSet.has(r.status) || (profile.role === "admin" && r.timing === "overdue"));
  const waitingLabel =
    profile.role === "admin" ? "Needs your review, plus overdue" : profile.role === "creative" ? "Requests and changes for you" : "Ready to go live";

  const feed = (activity ?? []) as (ActivityRow & { creatives: { title: string } | null })[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {profile.role === "ads"
          ? `Hey ${profile.name.split(" ")[0]}, Ready to take ads live?`
          : `Hi ${profile.name.split(" ")[0]}`}
      </h1>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Overdue" value={overdue.length} href="/creatives?timing=overdue&sort=due" tone={overdue.length ? "bad" : undefined} />
        <Stat label="Live now" value={liveNow} href="/creatives?live=live&sort=live" tone="good" />
        <Stat label="Went live (7 days)" value={recentWindow} href="/creatives?sort=live" />
        {STATUSES.map((s) => (
          <Stat key={s} label={STATUS_LABEL[s]} value={byStatus.get(s) ?? 0} href={`/creatives?status=${s}`} />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Waiting on me" hint={waitingLabel} count={waiting.length}>
          {waiting.length === 0 ? (
            <Empty>Nothing waiting on you. 🎉</Empty>
          ) : (
            waiting.slice(0, 10).map((r) => (
              <Item key={r.id} href={`/creatives/${r.id}`} title={r.title}>
                <StatusBadge status={r.status} />
                {r.timing === "overdue" && <TimelinessBadge due={r.due_date} submittedAt={r.submitted_at} />}
                <span className="text-xs text-muted-foreground">Due {formatDateOnly(r.due_date)}</span>
              </Item>
            ))
          )}
        </Panel>

        <Panel title="Overdue" hint="Past due date, nothing submitted — most overdue first" count={overdue.length}>
          {overdue.length === 0 ? (
            <Empty>Nothing overdue.</Empty>
          ) : (
            overdue.slice(0, 10).map((r) => (
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
