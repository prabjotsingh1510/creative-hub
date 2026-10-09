import type { Role, Status } from "./types";

// UI-side mirror of the RLS + trigger rules in supabase/migrations/0002.
// The database is the source of truth; these only decide what to render.

export const canCreateRequest = (r: Role) => r === "admin";
export const canUpload = (r: Role) => r === "admin" || r === "creative";
export const canEditCreativeFields = (r: Role) => r === "admin" || r === "creative";
export const canEditBrief = (r: Role) => r === "admin";
export const canEditAdsFields = (r: Role) => r === "admin" || r === "ads";
export const canSoftDelete = (r: Role) => r === "admin";
export const canManageUsers = (r: Role) => r === "admin";

const ALL: Status[] = [
  "requested",
  "submitted",
  "changes_requested",
  "approved",
  "sent_to_ads",
  "live",
  "paused",
  "rejected",
];

/** Statuses a role may move a creative into from `current` (excluding current). */
export function allowedNextStatuses(role: Role, current: Status): Status[] {
  if (role === "admin") return ALL.filter((s) => s !== current);
  if (role === "creative") {
    return current === "requested" || current === "changes_requested" ? ["submitted"] : [];
  }
  // ads
  const base: Status[] = ["changes_requested", "live", "paused", "rejected"];
  return base.filter((s) => s !== current);
}
