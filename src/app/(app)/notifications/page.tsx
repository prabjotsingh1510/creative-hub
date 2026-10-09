import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/session";
import { PAGE, takePage } from "@/lib/cursor";
import { NotificationList } from "@/components/notifications/notification-list";
import type { NotificationRow } from "@/lib/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  let q = supabase.from("notifications").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE + 1);
  if (filter === "unread") q = q.is("read_at", null);
  const [{ data, error }, { data: people }] = await Promise.all([q, supabase.from("profiles").select("id, name")]);
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.name as string]));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Notifications</h1>
      {error ? (
        <p role="alert" className="text-sm text-destructive">Couldn’t load notifications: {error.message}</p>
      ) : (
        (() => {
          const { page, hasMore } = takePage((data ?? []) as NotificationRow[]);
          return <NotificationList initial={page} hasMore={hasMore} names={names} unreadOnly={filter === "unread"} />;
        })()
      )}
    </div>
  );
}
