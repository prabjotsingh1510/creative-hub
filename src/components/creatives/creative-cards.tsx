import Link from "next/link";
import { Film, ImageOff, MessageSquare } from "lucide-react";
import { RestoreButton } from "@/components/creatives/restore-button";
import { LiveBadge, StatusBadge, TimelinessBadge } from "@/components/creatives/badges";
import { formatDateOnly } from "@/lib/time";
import type { CardRow } from "@/lib/creatives-data";
import { cn } from "@/lib/utils";

/** Thumbnail with a fixed aspect box (no layout shift) and a lazy, async-decoded image. */
export function Thumb({ url, format, small }: { url?: string; format: string; small?: boolean }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />;
  }
  const Icon = format === "video" ? Film : ImageOff;
  return (
    <span className="flex size-full items-center justify-center text-muted-foreground">
      <Icon className={small ? "size-5" : "size-8"} aria-hidden />
    </span>
  );
}

export function DueText({ row, className }: { row: Pick<CardRow, "due_date" | "timing">; className?: string }) {
  const overdue = row.timing === "overdue";
  return (
    <span className={cn(overdue && "font-medium text-red-600 dark:text-red-400", className)}>
      Due {formatDateOnly(row.due_date)}
      {overdue && <span className="sr-only"> (overdue)</span>}
    </span>
  );
}

export function CreativeCard({ row }: { row: CardRow }) {
  return (
    <div className="space-y-2">
    <Link
      href={`/creatives/${row.id}`}
      className="group block overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
    >
      <div className="relative aspect-[4/3] bg-muted">
        <Thumb url={row.thumbUrl} format={row.format} />
        {row.version_no && row.version_no > 1 && (
          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">v{row.version_no}</span>
        )}
        {row.comment_count > 0 && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
            <MessageSquare className="size-3" aria-hidden /> {row.comment_count}
            <span className="sr-only"> comments</span>
          </span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <h2 className="line-clamp-1 font-medium">{row.title}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={row.status} />
          <LiveBadge state={row.live_state} />
          <TimelinessBadge due={row.due_date} submittedAt={row.submitted_at} />
        </div>
        <p className="text-xs text-muted-foreground">
          <DueText row={row} />
          {row.campaign ? ` · ${row.campaign}` : ""}
        </p>
      </div>
    </Link>
    {row.deleted_at && <RestoreButton id={row.id} title={row.title} />}
    </div>
  );
}

export function CreativeTableRow({ row }: { row: CardRow }) {
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="p-2">
        <Link href={`/creatives/${row.id}`} className="flex items-center gap-3">
          <span className="relative block size-12 shrink-0 overflow-hidden rounded-md bg-muted">
            <Thumb url={row.thumbUrl} format={row.format} small />
          </span>
          <span>
            <span className="block font-medium">{row.title}</span>
            <span className="text-xs text-muted-foreground">{row.campaign ?? row.format}</span>
          </span>
        </Link>
      </td>
      <td className="p-2"><StatusBadge status={row.status} /></td>
      <td className="p-2 whitespace-nowrap"><DueText row={row} /></td>
      <td className="p-2"><TimelinessBadge due={row.due_date} submittedAt={row.submitted_at} /></td>
      <td className="p-2"><LiveBadge state={row.live_state} /></td>
      {row.deleted_at && <td className="p-2"><RestoreButton id={row.id} title={row.title} /></td>}
    </tr>
  );
}
