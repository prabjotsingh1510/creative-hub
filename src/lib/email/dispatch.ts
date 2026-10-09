import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { createAdminClient } from "@/lib/supabase/admin";
import { TZ } from "@/lib/time";
import { describeNotification, notificationHref, type NotificationRow } from "@/lib/notifications";
import { waitingStatuses } from "@/lib/filters";
import type { Role } from "@/lib/types";
import { renderDigestEmail, renderNotificationEmail } from "./templates";

const FROM = () => process.env.EMAIL_FROM ?? "Creative Hub <onboarding@resend.dev>";

/** Sends one email via Resend. Returns "skipped" when RESEND_API_KEY isn't configured (dev). */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email] RESEND_API_KEY not set; skipping "${msg.subject}" -> ${msg.to}`);
    return "skipped" as const;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), ...msg, to: [msg.to] }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return "sent" as const;
}

interface Claimed {
  id: string;
  user_id: string;
  email: string;
  name: string;
  type: NotificationRow["type"];
  creative_id: string | null;
  comment_id: string | null;
  message_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

/** Claims pending notification emails (atomic, safe to run concurrently) and sends them. */
export async function dispatchPendingEmails(limit = 50) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_pending_emails", { p_limit: limit });
  if (error) {
    console.error("[email] claim failed", error.message);
    return { sent: 0, skipped: 0, failed: 0 };
  }
  const rows = (data ?? []) as Claimed[];
  if (!rows.length) return { sent: 0, skipped: 0, failed: 0 };

  const { data: actorRows } = await admin.from("notifications").select("id, actor_id").in("id", rows.map((r) => r.id));
  const actorIds = [...new Set((actorRows ?? []).map((a) => a.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await admin.from("profiles").select("id, name").in("id", actorIds)
    : { data: [] };
  const actorOf = new Map((actorRows ?? []).map((a) => [a.id, a.actor_id as string | null]));
  const nameOf = new Map((actors ?? []).map((a) => [a.id, a.name as string]));

  const out = { sent: 0, skipped: 0, failed: 0 };
  for (const r of rows) {
    const actorId = actorOf.get(r.id);
    const mail = renderNotificationEmail(r, actorId ? (nameOf.get(actorId) ?? null) : null);
    try {
      const result = await sendEmail({ to: r.email, ...mail });
      await admin
        .from("notifications")
        .update({ email_status: result, emailed_at: result === "sent" ? new Date().toISOString() : null })
        .eq("id", r.id);
      out[result]++;
    } catch (e) {
      console.error("[email] send failed", r.id, e instanceof Error ? e.message : e);
      if (r.attempts >= 3) await admin.from("notifications").update({ email_status: "failed" }).eq("id", r.id);
      out.failed++;
    }
  }
  return out;
}

/** Daily digest for opted-in users: once per IST day, from 09:00 IST, only if there's something to say. */
export async function sendDigests() {
  if (Number(formatInTimeZone(new Date(), TZ, "H")) < 9) return { sent: 0 };
  const admin = createAdminClient();
  const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  const { data: users } = await admin
    .from("profiles")
    .select("id, name, email, role")
    .eq("active", true)
    .eq("daily_digest", true);
  if (!users?.length) return { sent: 0 };
  const { data: done } = await admin.from("digest_log").select("user_id").eq("sent_on", today);
  const doneIds = new Set((done ?? []).map((d) => d.user_id));
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  let sent = 0;
  for (const u of users) {
    if (doneIds.has(u.id)) continue;
    const [{ data: unread }, { count: waiting }] = await Promise.all([
      admin
        .from("notifications")
        .select("type, creative_id, comment_id, message_id, payload, actor_id")
        .eq("user_id", u.id)
        .is("read_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10),
      admin
        .from("creatives")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("status", waitingStatuses(u.role as Role)),
    ]);
    const items = (unread ?? []).map((n) => ({
      text: describeNotification(n as NotificationRow, null),
      href: notificationHref(n as NotificationRow),
    }));
    if (!items.length && !waiting) continue;
    try {
      const mail = renderDigestEmail({ name: u.name, items, waiting: waiting ?? 0 });
      const result = await sendEmail({ to: u.email, ...mail });
      if (result === "sent") {
        await admin.from("digest_log").insert({ user_id: u.id, sent_on: today });
        sent++;
      }
    } catch (e) {
      console.error("[digest] failed", u.id, e instanceof Error ? e.message : e);
    }
  }
  return { sent };
}
