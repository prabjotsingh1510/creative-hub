import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/session";
import { ACTIVITY_GROUPS, describeActivity } from "@/lib/activity";
import { formatIST } from "@/lib/time";
import type { ActivityRow } from "@/lib/types";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Activity" };

const selectCls = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm";
const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Admin-only global audit view over the append-only activity log. */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; creative?: string; from?: string; to?: string; type?: string }>;
}) {
  const me = await requireProfile();
  if (me.role !== "admin") redirect("/dashboard");
  const sp = await searchParams;
  const supabase = await createClient();

  let q = supabase.from("activity_log").select("*, creatives(title)").order("created_at", { ascending: false }).limit(300);
  if (isUuid(sp.user)) q = q.eq("actor_id", sp.user!);
  if (isUuid(sp.creative)) q = q.eq("creative_id", sp.creative!);
  if (isDate(sp.from)) q = q.gte("created_at", `${sp.from}T00:00:00+05:30`);
  if (isDate(sp.to)) q = q.lte("created_at", `${sp.to}T23:59:59.999+05:30`);
  const group = ACTIVITY_GROUPS.find((g) => g.key === sp.type);
  if (group) q = q.in("action", group.actions);

  const [{ data, error }, { data: people }, { data: creatives }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, name").order("name"),
    supabase.from("creatives").select("id, title").order("title"),
  ]);
  const rows = (data ?? []) as (ActivityRow & { creatives: { title: string } | null })[];
  const name = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Activity log</h1>
      <form className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6" method="get">
        <label className="space-y-1 text-xs text-muted-foreground">User
          <select name="user" defaultValue={sp.user ?? ""} className={selectCls}>
            <option value="">Anyone</option>
            {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Creative
          <select name="creative" defaultValue={sp.creative ?? ""} className={selectCls}>
            <option value="">Any</option>
            {(creatives ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Event
          <select name="type" defaultValue={sp.type ?? ""} className={selectCls}>
            <option value="">All</option>
            {ACTIVITY_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">From
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={selectCls} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">To
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={selectCls} />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" className="flex-1">Apply</Button>
          <Link href="/admin/activity" className="text-xs underline">Clear</Link>
        </div>
      </form>

      {error && <p role="alert" className="text-sm text-destructive">Couldn’t load activity: {error.message}</p>}
      {!error && rows.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No activity matches these filters.</div>
      )}
      {rows.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/creatives/${a.creative_id}`} className="block px-4 py-2.5 text-sm hover:bg-muted">
                <span className="font-medium">{name.get(a.actor_id ?? "") ?? "System"}</span> {describeActivity(a)}{" "}
                <span className="text-muted-foreground">on “{a.creatives?.title ?? "creative"}”</span>
                <span className="block text-xs text-muted-foreground">{formatIST(a.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 300 && <p className="text-xs text-muted-foreground">Showing the latest 300 events. Narrow the filters to go further back.</p>}
    </div>
  );
}
