import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LIVE_LABEL, STATUS_LABEL, type LiveState, type Status } from "@/lib/types";
import { timeliness } from "@/lib/time";

const STATUS_STYLE: Record<Status, string> = {
  requested: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  submitted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  changes_requested: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  sent_to_ads: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  live: "bg-green-500/20 text-green-700 dark:text-green-300",
  paused: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-0", STATUS_STYLE[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function LiveBadge({ state }: { state: LiveState }) {
  if (state === "not_live") return null;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-0 gap-1",
        state === "live" && "bg-green-500/20 text-green-700 dark:text-green-300",
        state === "paused" && "bg-orange-500/15 text-orange-700 dark:text-orange-300",
        state === "rejected" && "bg-red-500/15 text-red-700 dark:text-red-300",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {LIVE_LABEL[state]}
    </Badge>
  );
}

export function TimelinessBadge({
  due,
  submittedAt,
}: {
  due: string | null;
  submittedAt: string | null;
}) {
  const t = timeliness(due, submittedAt);
  if (t.kind === "none" || t.kind === "pending") return null;
  const label =
    t.kind === "on_time"
      ? "On time"
      : t.kind === "late"
        ? `Late by ${t.days}d`
        : `Overdue ${t.days}d`;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-0",
        t.kind === "on_time"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-red-500/15 text-red-700 dark:text-red-300",
      )}
    >
      {label}
    </Badge>
  );
}
