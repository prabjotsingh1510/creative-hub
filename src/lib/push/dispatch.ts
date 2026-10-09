import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeNotification, notificationHref, type NotificationRow } from "@/lib/notifications";
import { siteUrl } from "@/lib/email/templates";

/** Web Push is optional: it only runs when all three VAPID values are configured. */
export const pushConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

interface Claimed {
  id: string;
  user_id: string;
  type: NotificationRow["type"];
  creative_id: string | null;
  comment_id: string | null;
  message_id: string | null;
  payload: Record<string, unknown>;
  actor_id: string | null;
  attempts: number;
}

/** Sends pending push notifications to the recipients' subscribed devices; prunes dead subscriptions. */
export async function dispatchPendingPushes(limit = 50) {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_pending_pushes", { p_limit: limit });
  if (error) {
    // Migration 0011 not applied yet: nothing to do.
    return out;
  }
  const rows = (data ?? []) as Claimed[];
  if (!rows.length) return out;

  if (!pushConfigured()) {
    await admin.from("notifications").update({ push_status: "skipped" }).in("id", rows.map((r) => r.id));
    out.skipped = rows.length;
    return out;
  }
  setup();

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await admin.from("profiles").select("id, name").in("id", actorIds) : { data: [] };
  const nameOf = new Map((actors ?? []).map((a) => [a.id as string, a.name as string]));
  const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", [...new Set(rows.map((r) => r.user_id))]);

  for (const r of rows) {
    const mine = (subs ?? []).filter((s) => s.user_id === r.user_id);
    if (!mine.length) {
      await admin.from("notifications").update({ push_status: "skipped" }).eq("id", r.id);
      out.skipped++;
      continue;
    }
    const body = describeNotification(r, r.actor_id ? (nameOf.get(r.actor_id) ?? null) : null);
    const message = JSON.stringify({ title: "Creative Hub", body, url: siteUrl() + notificationHref(r), tag: r.id });
    let delivered = 0;
    for (const s of mine) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 3600 });
        delivered++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("[push] send failed", status ?? e);
      }
    }
    if (delivered) {
      await admin.from("notifications").update({ push_status: "sent" }).eq("id", r.id);
      out.sent++;
    } else {
      if (r.attempts >= 3) await admin.from("notifications").update({ push_status: "failed" }).eq("id", r.id);
      out.failed++;
    }
  }
  return out;
}
