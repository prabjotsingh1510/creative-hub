"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, GripVertical, MessageSquare } from "lucide-react";
import { setStatus } from "@/actions/creatives";
import { GoLiveDialog } from "@/components/creatives/go-live-dialog";
import { DueText, Thumb } from "@/components/creatives/creative-cards";
import { LiveBadge } from "@/components/creatives/badges";
import type { CardRow } from "@/lib/creatives-data";
import { KANBAN_COLUMNS, KANBAN_SIDE_COLUMN, allowedTargets, canTransition } from "@/lib/workflow";
import { STATUS_LABEL, type Role, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

const ctxOf = (r: CardRow) => ({ hasFile: !!r.current_version_id });

export function KanbanBoard({ initial, role, truncated }: { initial: CardRow[]; role: Role; truncated: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [dragging, setDragging] = useState<CardRow | null>(null);
  const [liveFor, setLiveFor] = useState<CardRow | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [mobileCol, setMobileCol] = useState<Status>("requested");

  useEffect(() => setRows(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byStatus = useMemo(() => {
    const m = new Map<Status, CardRow[]>();
    rows.forEach((r) => m.set(r.status, [...(m.get(r.status) ?? []), r]));
    return m;
  }, [rows]);

  /** Optimistic move with rollback if the server (or database) refuses. */
  async function move(row: CardRow, to: Status) {
    const check = canTransition(role, row.status, to, ctxOf(row));
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }
    if (to === "live") {
      setLiveFor(row);
      return;
    }
    const before = rows;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: to, live_state: to === "paused" || to === "rejected" ? to : r.live_state } : r)));
    const res = await setStatus(row.id, to);
    if (!res.ok) {
      setRows(before);
      toast.error(res.error);
      return;
    }
    toast.success(`Moved to ${STATUS_LABEL[to]}`);
    router.refresh();
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(rows.find((r) => r.id === e.active.id) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    const row = rows.find((r) => r.id === e.active.id);
    setDragging(null);
    const to = e.over?.id as Status | undefined;
    if (!row || !to || to === row.status) return;
    void move(row, to);
  }

  const sideCount = KANBAN_SIDE_COLUMN.reduce((n, s) => n + (byStatus.get(s)?.length ?? 0), 0);

  return (
    <div className="space-y-3">
      <GoLiveDialog
        open={!!liveFor}
        onOpenChange={(o) => !o && setLiveFor(null)}
        creativeId={liveFor?.id ?? ""}
        title={liveFor?.title ?? ""}
        onResult={(ok) => {
          if (ok) {
            const id = liveFor?.id;
            setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "live", live_state: "live" } : r)));
            setLiveFor(null);
            router.refresh();
          }
        }}
      />

      {/* Mobile: one column at a time (drag and drop is unreliable on touch), moves via the card's menu. */}
      <div className="md:hidden">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2" role="tablist" aria-label="Workflow column">
          {[...KANBAN_COLUMNS, ...KANBAN_SIDE_COLUMN].map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={mobileCol === s}
              onClick={() => setMobileCol(s)}
              className={cn("shrink-0 rounded-full border px-3 py-2 text-sm", mobileCol === s ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}
            >
              {STATUS_LABEL[s]} <span className="tabular-nums">{byStatus.get(s)?.length ?? 0}</span>
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {(byStatus.get(mobileCol) ?? []).map((r) => (
            <li key={r.id}>
              <KanbanCard row={r} role={role} onMove={move} />
            </li>
          ))}
          {!(byStatus.get(mobileCol)?.length) && <EmptyColumn />}
        </ul>
      </div>

      {/* Desktop: drag and drop (handle = grip icon; keyboard users use the Move menu on each card). */}
      <div className="hidden md:block">
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="flex items-start gap-3 overflow-x-auto pb-3">
            {KANBAN_COLUMNS.map((s) => (
              <Column key={s} status={s} rows={byStatus.get(s) ?? []} role={role} dragging={dragging} onMove={move} />
            ))}
            <div className="shrink-0">
              <button
                type="button"
                aria-expanded={sideOpen}
                onClick={() => setSideOpen((o) => !o)}
                className="mb-2 flex items-center gap-1 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                {sideOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                Paused / Rejected <span className="tabular-nums">({sideCount})</span>
              </button>
              {sideOpen && (
                <div className="space-y-3">
                  {KANBAN_SIDE_COLUMN.map((s) => (
                    <Column key={s} status={s} rows={byStatus.get(s) ?? []} role={role} dragging={dragging} onMove={move} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </DndContext>
      </div>

      {truncated && <p className="text-xs text-muted-foreground">Showing the first 300 matches. Narrow the filters to see the rest.</p>}
    </div>
  );
}

function Column({ status, rows, role, dragging, onMove }: { status: Status; rows: CardRow[]; role: Role; dragging: CardRow | null; onMove: (r: CardRow, to: Status) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const blocked = dragging ? !canTransition(role, dragging.status, status, ctxOf(dragging)).ok && dragging.status !== status : false;
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]} column`}
      className={cn(
        "w-72 shrink-0 rounded-xl border bg-muted/30 p-2 transition-colors",
        isOver && !blocked && "border-foreground bg-muted",
        blocked && "opacity-50",
      )}
    >
      <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
        {STATUS_LABEL[status]}
        <span className="rounded-full bg-background px-2 text-xs font-normal tabular-nums">{rows.length}</span>
      </h2>
      <ul className="min-h-16 space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <DraggableCard row={r} role={role} onMove={onMove} />
          </li>
        ))}
        {rows.length === 0 && <EmptyColumn />}
      </ul>
    </section>
  );
}

function EmptyColumn() {
  return <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nothing here</li>;
}

function DraggableCard({ row, role, onMove }: { row: CardRow; role: Role; onMove: (r: CardRow, to: Status) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: "relative" } : undefined}
      className={cn(isDragging && "opacity-80 shadow-lg")}
    >
      <KanbanCard
        row={row}
        role={role}
        onMove={onMove}
        handle={
          <button
            type="button"
            aria-label={`Drag ${row.title}. Or use the Move menu.`}
            className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        }
      />
    </div>
  );
}

function KanbanCard({ row, role, onMove, handle }: { row: CardRow; role: Role; onMove: (r: CardRow, to: Status) => void; handle?: React.ReactNode }) {
  const targets = allowedTargets(role, row.status, ctxOf(row));
  return (
    <article className="overflow-hidden rounded-lg border bg-card text-sm shadow-sm">
      <div className="flex items-start gap-2 p-2">
        {handle}
        <Link href={`/creatives/${row.id}`} className="flex min-w-0 flex-1 gap-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="relative block size-14 shrink-0 overflow-hidden rounded-md bg-muted">
            <Thumb url={row.thumbUrl} format={row.format} small />
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 font-medium">{row.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              <DueText row={row} />
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {row.version_no ? <span className="rounded bg-muted px-1.5">v{row.version_no}</span> : null}
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="size-3" aria-hidden /> {row.comment_count}
                <span className="sr-only"> comments</span>
              </span>
              <LiveBadge state={row.live_state} />
            </span>
          </span>
        </Link>
      </div>
      {targets.length > 0 && (
        <div className="border-t px-2 py-1.5">
          <select
            aria-label={`Move ${row.title} to`}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value=""
            onChange={(e) => e.target.value && onMove(row, e.target.value as Status)}
          >
            <option value="">Move to…</option>
            {targets.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      )}
    </article>
  );
}
