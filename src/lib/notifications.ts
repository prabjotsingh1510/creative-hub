import { LIVE_LABEL, STATUS_LABEL, type LiveState, type Status } from "./types";
import { formatDateOnly } from "./time";

export const NOTIFICATION_TYPES = [
  "mention",
  "comment",
  "request_created",
  "version_uploaded",
  "status_changed",
  "live_state_changed",
  "due_soon",
  "overdue",
  "channel_mention",
  "reply",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  creative_id: string | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  comment_id: string | null;
  message_id: string | null;
  read_at: string | null;
  created_at: string;
}

/** Mirrors default_email_pref() in migration 0005. Keep in sync. */
export const EMAIL_DEFAULT_OFF: NotificationType[] = ["comment", "channel_mention", "reply"];
export const defaultEmailPref = (t: NotificationType) => !EMAIL_DEFAULT_OFF.includes(t);

export const PREF_LABEL: Record<NotificationType, { label: string; hint: string }> = {
  mention: { label: "Mentions", hint: "Someone @mentions you in a creative discussion" },
  comment: { label: "New comments", hint: "Comments on creatives you created or uploaded" },
  request_created: { label: "New requests", hint: "A new creative request is created" },
  version_uploaded: { label: "New uploads", hint: "A new version is uploaded" },
  status_changed: { label: "Status changes", hint: "A creative moves to your stage of the workflow" },
  live_state_changed: { label: "Live / paused / rejected", hint: "Ads team changes a creative's live state" },
  due_soon: { label: "Due today reminders", hint: "A creative is due and has no submission yet" },
  overdue: { label: "Overdue reminders", hint: "A creative passed its due date with no submission" },
  channel_mention: { label: "General channel mentions", hint: "Someone @mentions you in a channel" },
  reply: { label: "Thread replies", hint: "Someone replies to your channel message" },
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Where clicking the notification should go (exact creative / comment / message). */
export function notificationHref(n: Pick<NotificationRow, "type" | "creative_id" | "comment_id" | "message_id" | "payload">): string {
  if (n.creative_id) {
    return n.comment_id
      ? `/creatives/${n.creative_id}?comment=${n.comment_id}#comment-${n.comment_id}`
      : `/creatives/${n.creative_id}`;
  }
  const channel = str(n.payload.channel) || "general";
  return n.message_id ? `/channels/${channel}?message=${n.message_id}` : `/channels/${channel}`;
}

export function describeNotification(
  n: Pick<NotificationRow, "type" | "payload">,
  actor: string | null,
): string {
  const p = n.payload;
  const title = str(p.title) ? `“${str(p.title)}”` : "a creative";
  const who = actor ?? "Someone";
  switch (n.type) {
    case "mention":
      return `${who} mentioned you on ${title}`;
    case "comment":
      return `${who} commented on ${title}`;
    case "request_created":
      return `New request: ${title}${str(p.due_date) ? ` (due ${formatDateOnly(str(p.due_date))})` : ""}`;
    case "version_uploaded":
      return `${who} uploaded v${String(p.version_no ?? "")} of ${title}`;
    case "status_changed":
      return `${title} moved to ${STATUS_LABEL[str(p.to) as Status] ?? str(p.to)}${actor ? ` by ${actor}` : ""}`;
    case "live_state_changed":
      return `${title} is now ${LIVE_LABEL[str(p.to) as LiveState] ?? str(p.to)}`;
    case "due_soon":
      return `${title} is due today with no submission yet`;
    case "overdue":
      return `${title} is overdue (was due ${formatDateOnly(str(p.due_date))})`;
    case "channel_mention":
      return `${who} mentioned you in #${str(p.channel) || "general"}`;
    case "reply":
      return `${who} replied to your message in #${str(p.channel) || "general"}`;
  }
}
