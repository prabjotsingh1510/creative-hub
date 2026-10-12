import { formatDateOnly, formatIST } from "./time";
import { LIVE_LABEL, STATUS_LABEL, type ActivityRow, type LiveState, type Status } from "./types";

export type ActivityGroup = "status" | "uploads" | "live" | "comments" | "edits" | "pins" | "other";

export const ACTIVITY_GROUPS: { key: ActivityGroup; label: string; actions: string[] }[] = [
  { key: "status", label: "Status", actions: ["status_changed", "created"] },
  { key: "uploads", label: "Uploads", actions: ["version_uploaded"] },
  { key: "live", label: "Live", actions: ["live_state_changed"] },
  { key: "comments", label: "Comments", actions: ["comment"] },
  { key: "edits", label: "Edits", actions: ["field_changed"] },
  { key: "pins", label: "Pins", actions: ["pinned", "unpinned"] },
  { key: "other", label: "Delete / restore", actions: ["deleted", "restored"] },
];

export const activityGroupOf = (action: string): ActivityGroup =>
  ACTIVITY_GROUPS.find((g) => g.actions.includes(action))?.key ?? "other";

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  campaign: "campaign",
  format: "format",
  brief: "brief",
  due_date: "due date",
  drive_link: "Drive link",
  copy_notes: "notes / copy",
  meta_preview_link: "Meta preview link",
  ads_notes: "DP notes",
  went_live_at: "went-live time",
  submitted_at: "submission time",
  ad_name: "ad name",
  meta_campaign_name: "Meta campaign name",
  ad_set_name: "ad set name",
  product_advertised: "product advertised",
  landing_page_url: "landing page URL",
  pause_reason: "pause reason",
};

const clip = (s: string | null, n = 60) => (s == null || s === "" ? "empty" : s.length > n ? s.slice(0, n) + "…" : s);

function fieldValue(field: string, v: string | null) {
  if (v == null) return "empty";
  if (field === "due_date") return formatDateOnly(v);
  if (field === "went_live_at" || field === "submitted_at") return formatIST(v);
  return clip(v);
}

/** Human sentence (without the actor's name) for an activity row. */
export function describeActivity(a: Pick<ActivityRow, "action" | "from_value" | "to_value" | "meta">): string {
  switch (a.action) {
    case "created":
      return "created the request";
    case "status_changed":
      return `changed status ${STATUS_LABEL[a.from_value as Status] ?? a.from_value} → ${STATUS_LABEL[a.to_value as Status] ?? a.to_value}`;
    case "live_state_changed":
      return `set live state ${LIVE_LABEL[a.from_value as LiveState] ?? a.from_value} → ${LIVE_LABEL[a.to_value as LiveState] ?? a.to_value}`;
    case "version_uploaded":
      return `uploaded ${a.to_value}`;
    case "comment":
      return "commented";
    case "pinned":
      return "pinned a comment";
    case "unpinned":
      return "unpinned a comment";
    case "field_changed": {
      const f = String(a.meta?.field ?? "");
      return `changed ${FIELD_LABEL[f] ?? f}: ${fieldValue(f, a.from_value)} → ${fieldValue(f, a.to_value)}`;
    }
    case "deleted":
      return "deleted the creative";
    case "restored":
      return "restored the creative";
    default:
      return a.action;
  }
}
