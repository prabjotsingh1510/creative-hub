"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, ImageIcon, LayoutDashboard, LogOut, MessageSquare, Settings, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/bell";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type Role } from "@/lib/types";

export function AppNav({
  userId,
  name,
  role,
  names,
  initialUnread,
  initialGeneralUnread,
}: {
  userId: string;
  name: string;
  role: Role;
  names: Record<string, string>;
  initialUnread: number;
  initialGeneralUnread: number;
}) {
  const path = usePathname();
  const router = useRouter();
  const [generalUnread, setGeneralUnread] = useState(initialGeneralUnread);
  const inChannels = path.startsWith("/channels");

  // Unread dot for the General channel: bump on others' messages while elsewhere; clear when viewing.
  useEffect(() => {
    if (inChannels) setGeneralUnread(0);
  }, [inChannels]);
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("nav-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        if ((p.new as { author_id: string }).author_id !== userId && !window.location.pathname.startsWith("/channels")) {
          setGeneralUnread((n) => n + 1);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  const items = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, badge: 0 },
    { href: "/creatives", label: "Creatives", icon: ImageIcon, badge: 0 },
    { href: "/channels/general", label: "General", icon: MessageSquare, badge: generalUnread, match: "/channels" },
    ...(role === "admin"
      ? [
          { href: "/admin/activity", label: "Activity", icon: Activity, badge: 0 },
          { href: "/admin/users", label: "Users", icon: Users, badge: 0 },
        ]
      : []),
  ];
  const active = (i: { href: string; match?: string }) => path.startsWith(i.match ?? i.href);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          Creative Hub
        </Link>
        <nav className="ml-4 hidden gap-1 md:flex" aria-label="Main">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "relative rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                active(i) && "bg-muted text-foreground",
              )}
            >
              {i.label}
              {i.badge > 0 && <span aria-label="unread messages" className="absolute right-1 top-1 size-2 rounded-full bg-blue-500" />}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <span className="hidden text-right text-xs leading-tight sm:block">
            <span className="block font-medium">{name}</span>
            <span className="text-muted-foreground">{ROLE_LABEL[role]}</span>
          </span>
          <NotificationBell userId={userId} initialUnread={initialUnread} names={names} />
          <Link href="/settings/notifications" aria-label="Notification settings" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted">
            <Settings className="size-4" />
          </Link>
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      {/* Mobile bottom nav: thumb reachable */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {items.slice(0, 5).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground", active(i) && "text-foreground")}
          >
            <i.icon className="size-5" />
            {i.label}
            {i.badge > 0 && <span aria-label="unread messages" className="absolute right-[30%] top-1.5 size-2 rounded-full bg-blue-500" />}
          </Link>
        ))}
      </nav>
    </>
  );
}
