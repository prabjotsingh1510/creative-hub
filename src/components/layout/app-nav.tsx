"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Bell, ImageIcon, LayoutDashboard, LogOut, MessageSquare, Settings, UserCircle, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
  const [unread, setUnread] = useState(initialUnread);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => setMenuOpen(false), [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const main = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, dot: false, match: "/dashboard" },
    { href: "/creatives", label: "Creatives", icon: ImageIcon, dot: false, match: "/creatives" },
    { href: "/channels/general", label: "General", icon: MessageSquare, dot: generalUnread > 0, match: "/channels" },
  ];
  const mobile = [...main, { href: "/notifications", label: "Alerts", icon: Bell, dot: unread > 0, match: "/notifications" }];
  const adminLinks = role === "admin" ? [{ href: "/admin/activity", label: "Activity log", icon: Activity }, { href: "/admin/users", label: "Users", icon: Users }] : [];
  const active = (match: string) => path.startsWith(match);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur md:px-4">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          Creative Hub
        </Link>
        <nav className="ml-4 hidden gap-1 md:flex" aria-label="Main">
          {[...main, ...adminLinks.map((l) => ({ ...l, dot: false, match: l.href }))].map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i.match) ? "page" : undefined}
              className={cn("relative rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", active(i.match) && "bg-muted text-foreground")}
            >
              {i.label}
              {i.dot && <span className="absolute right-1 top-1 size-2 rounded-full bg-blue-500"><span className="sr-only">unread</span></span>}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell userId={userId} unread={unread} setUnread={setUnread} names={names} />
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 outline-none md:size-8"
            >
              <UserCircle className="size-5" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-11 z-50 w-60 rounded-xl border bg-popover p-1 shadow-lg">
                <div className="px-3 py-2">
                  <div className="text-sm font-medium">{name}</div>
                  <div className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</div>
                </div>
                <hr className="my-1" />
                {[...adminLinks, { href: "/settings/notifications", label: "Notification settings", icon: Settings }].map((l) => (
                  <Link key={l.href} role="menuitem" href={l.href} className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                    <l.icon className="size-4" aria-hidden /> {l.label}
                  </Link>
                ))}
                <div className="flex items-center justify-between rounded-md px-3 py-1 text-sm">
                  Theme <ThemeToggle />
                </div>
                <button role="menuitem" type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                  <LogOut className="size-4" aria-hidden /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav: thumb reachable, 4 tabs */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {mobile.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active(i.match) ? "page" : undefined}
            className={cn("relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground", active(i.match) && "text-foreground")}
          >
            <i.icon className="size-5" aria-hidden />
            {i.label}
            {i.dot && <span className="absolute right-[28%] top-2 size-2 rounded-full bg-blue-500"><span className="sr-only">unread</span></span>}
          </Link>
        ))}
      </nav>
    </>
  );
}
