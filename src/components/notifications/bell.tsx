"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markAllRead, markRead } from "@/actions/notifications";
import { describeNotification, notificationHref, type NotificationRow } from "@/lib/notifications";
import { formatIST } from "@/lib/time";
import { cn } from "@/lib/utils";

export function NotificationBell({
  userId,
  unread,
  setUnread,
  names,
}: {
  userId: string;
  unread: number;
  setUnread: React.Dispatch<React.SetStateAction<number>>;
  names: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [{ count }, { data }] = await Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(15),
    ]);
    setUnread(count ?? 0);
    setItems((data ?? []) as NotificationRow[]);
  }, [setUnread]);

  // Realtime: any change to my notifications re-syncs the count and list.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(n: NotificationRow) {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? null);
      setUnread((u) => Math.max(0, u - 1));
      await markRead(n.id);
    }
    router.push(notificationHref(n));
  }

  async function readAll() {
    setItems((prev) => prev?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? null);
    setUnread(0);
    await markAllRead();
  }

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex size-10 items-center justify-center md:size-8 rounded-lg hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-2 top-14 z-50 rounded-xl border bg-popover shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:w-96"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button type="button" onClick={readAll} disabled={!unread} className="text-xs text-muted-foreground underline disabled:no-underline disabled:opacity-50">
              Mark all read
            </button>
          </div>
          <ul className="max-h-[70vh] overflow-y-auto sm:max-h-96">
            {items === null && <li className="p-4 text-sm text-muted-foreground">Loading…</li>}
            {items?.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">You’re all caught up.</li>}
            {items?.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn("flex w-full gap-2 border-b px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted", !n.read_at && "bg-muted/50")}
                >
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-blue-500")} />
                  <span className="min-w-0">
                    <span className="block">{describeNotification(n, n.actor_id ? (names[n.actor_id] ?? null) : null)}</span>
                    <span className="text-xs text-muted-foreground">{formatIST(n.created_at, "d MMM, h:mm a")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t px-3 py-2 text-center text-sm text-muted-foreground hover:bg-muted">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
