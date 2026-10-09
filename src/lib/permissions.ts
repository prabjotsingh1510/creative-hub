import type { Role, Status } from "./types";
import { allowedTargets } from "./workflow";

// UI-side mirror of the RLS + trigger rules in supabase/migrations/0002.
// The database is the source of truth; these only decide what to render.

export const canCreateRequest = (r: Role) => r === "admin";
export const canUpload = (r: Role) => r === "admin" || r === "creative";
export const canEditCreativeFields = (r: Role) => r === "admin" || r === "creative";
export const canEditBrief = (r: Role) => r === "admin";
export const canEditAdsFields = (r: Role) => r === "admin" || r === "ads";
export const canSoftDelete = (r: Role) => r === "admin";
export const canManageUsers = (r: Role) => r === "admin";

/** Statuses a role may move a creative into from `current` (excluding current). Shared rules: lib/workflow.ts */
export function allowedNextStatuses(role: Role, current: Status, hasFile = true): Status[] {
  return allowedTargets(role, current, { hasFile });
}
