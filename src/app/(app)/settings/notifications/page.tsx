import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/session";
import { PushToggle } from "@/components/notifications/push-toggle";
import { pushConfigured } from "@/lib/push/dispatch";
import { PreferencesForm } from "@/components/notifications/preferences-form";
import { NOTIFICATION_TYPES, defaultEmailPref, type NotificationType } from "@/lib/notifications";

export const metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: rows }, { data: me }] = await Promise.all([
    supabase.from("notification_preferences").select("event_type, email").eq("user_id", profile.id),
    supabase.from("profiles").select("daily_digest").eq("id", profile.id).single(),
  ]);
  const saved = new Map((rows ?? []).map((r) => [r.event_type as string, r.email as boolean]));
  const email = Object.fromEntries(
    NOTIFICATION_TYPES.map((t) => [t, saved.get(t) ?? defaultEmailPref(t)]),
  ) as Record<NotificationType, boolean>;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Notification settings</h1>
      <p className="text-sm text-muted-foreground">
        In-app notifications are always on. Choose which events should also email you. You’re never emailed about your own actions.
      </p>
      {pushConfigured() && <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!} />}
      <PreferencesForm initialEmail={email} initialDigest={!!me?.daily_digest} />
    </div>
  );
}
