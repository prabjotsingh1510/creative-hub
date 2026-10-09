import { formatIST } from "@/lib/time";
import { LIVE_LABEL, STATUS_LABEL, type ActivityRow, type LiveState, type Profile, type Status } from "@/lib/types";

function describe(a: ActivityRow) {
  switch (a.action) {
    case "created":
      return "created the request";
    case "status_changed":
      return `changed status ${STATUS_LABEL[a.from_value as Status] ?? a.from_value} → ${STATUS_LABEL[a.to_value as Status] ?? a.to_value}`;
    case "live_state_changed":
      return `set live state ${LIVE_LABEL[a.from_value as LiveState] ?? a.from_value} → ${LIVE_LABEL[a.to_value as LiveState] ?? a.to_value}`;
    case "version_uploaded":
      return `uploaded ${a.to_value}`;
    case "comment":
      return "commented";
    case "deleted":
      return "deleted the creative";
    case "restored":
      return "restored the creative";
    default:
      return a.action;
  }
}

export function ActivityLog({ rows, people }: { rows: ActivityRow[]; people: Profile[] }) {
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "System";
  return (
    <section aria-labelledby="activity-h" className="rounded-xl border bg-card p-4">
      <h2 id="activity-h" className="mb-3 text-sm font-semibold">Activity</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ol className="max-h-[420px] space-y-3 overflow-y-auto text-sm">
          {rows.map((a) => (
            <li key={a.id}>
              <span className="font-medium">{name(a.actor_id)}</span> {describe(a)}
              <div className="text-xs text-muted-foreground">{formatIST(a.created_at)}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
