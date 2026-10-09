"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ImageIcon, LogOut, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type Role } from "@/lib/types";

export function AppNav({ name, role }: { name: string; role: Role }) {
  const path = usePathname();
  const router = useRouter();
  const items = [
    { href: "/creatives", label: "Creatives", icon: ImageIcon },
    ...(role === "admin" ? [{ href: "/admin/users", label: "Users", icon: Users }] : []),
  ];

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <Link href="/creatives" className="font-semibold tracking-tight">
          Creative Hub
        </Link>
        <nav className="ml-4 hidden gap-1 md:flex" aria-label="Main">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                path.startsWith(i.href) && "bg-muted text-foreground",
              )}
            >
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <span className="hidden text-right text-xs leading-tight sm:block">
            <span className="block font-medium">{name}</span>
            <span className="text-muted-foreground">{ROLE_LABEL[role]}</span>
          </span>
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
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground",
              path.startsWith(i.href) && "text-foreground",
            )}
          >
            <i.icon className="size-5" />
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
