"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markAllRead, markRead } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { describeNotification, notificationHref, type NotificationRow } from "@/lib/notifications";
import { formatIST } from "@/lib/time";
import { cn } from "@/lib/utils";

export function NotificationList({
  initial,
  names,
  unreadOnly,
}: {
  initial: NotificationRow[];
  names: Record<string, string>;
  unreadOnly: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  useEffect(() => setItems(initial), [initial]);

  // New notifications appear live without a refresh.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("notifications-page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [router]);

  const hasUnread = items.some((n) => !n.read_at);

  return (
    <>
      <div className="flex items-center gap-2 text-sm">
        <Link href="/notifications" className={cn("rounded-full border px-3 py-1", !unreadOnly && "bg-foreground text-background")}>All</Link>
        <Link href="/notifications?filter=unread" className={cn("rounded-full border px-3 py-1", unreadOnly && "bg-foreground text-background")}>Unread</Link>
        <Button
          className="ml-auto"
          variant="outline"
          disabled={!hasUnread}
          onClick={async () => {
            setItems((p) => p.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
            await markAllRead();
            router.refresh();
          }}
        >
          Mark all read
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {unreadOnly ? "No unread notifications." : "Nothing here yet. You’ll see mentions, status changes and reminders."}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={notificationHref(n)}
                onClick={() => {
                  if (!n.read_at) void markRead(n.id);
                }}
                className={cn("flex gap-3 px-4 py-3 text-sm hover:bg-muted", !n.read_at && "bg-muted/50")}
              >
                <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-blue-500")} />
                <span className="min-w-0">
                  <span className="block">{describeNotification(n, n.actor_id ? (names[n.actor_id] ?? null) : null)}</span>
                  {typeof n.payload.snippet === "string" && n.payload.snippet && (
                    <span className="mt-0.5 block truncate text-muted-foreground">“{n.payload.snippet}”</span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatIST(n.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
