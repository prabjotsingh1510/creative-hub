import { AppNav } from "@/components/layout/app-nav";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ count }, { data: unreadByChannel }, { data: people }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("channel_unread_counts"),
    supabase.from("profiles").select("id, name"),
  ]);
  const generalUnread = ((unreadByChannel ?? []) as { unread: number }[]).reduce((n, c) => n + c.unread, 0);
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.name as string]));

  return (
    <div className="min-h-dvh pb-16 md:pb-0">
      <AppNav
        userId={profile.id}
        name={profile.name}
        role={profile.role}
        names={names}
        initialUnread={count ?? 0}
        initialGeneralUnread={generalUnread}
      />
      <main id="main" className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</main>
    </div>
  );
}
