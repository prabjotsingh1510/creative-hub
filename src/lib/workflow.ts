import { STATUSES, type Role, type Status } from "./types";

/**
 * Single source of truth for who may move a creative from one status to another.
 * Used by the UI (what to offer), server actions (validation) and tests.
 * The database trigger `guard_creative_update` (migration 0009) enforces the same rules,
 * so this is never the only line of defence.
 */
export type TransitionResult = { ok: true } | { ok: false; reason: string };

export const ADS_ACTIVE_STATUSES: Status[] = ["sent_to_ads", "live", "paused", "rejected"];
const LIVE_STATES: Status[] = ["live", "paused", "rejected"];

export interface TransitionContext {
  /** True when the creative has at least one uploaded version. */
  hasFile: boolean;
}

export function canTransition(role: Role, from: Status, to: Status, ctx: TransitionContext = { hasFile: true }): TransitionResult {
  if (from === to) return { ok: false, reason: "It is already in that status." };
  if (to === "submitted" && !ctx.hasFile) return { ok: false, reason: "Upload a file before moving to Submitted." };

  if (role === "admin") return { ok: true };

  if (role === "creative") {
    if (to === "submitted" && (from === "requested" || from === "changes_requested")) return { ok: true };
    return { ok: false, reason: "The creative team can only move Requested or Changes requested to Submitted." };
  }

  // ads
  if (!ADS_ACTIVE_STATUSES.includes(from)) {
    return { ok: false, reason: "The ads team can only act on creatives that were sent to ads." };
  }
  if (LIVE_STATES.includes(to)) return { ok: true };
  if (from === "sent_to_ads" && to === "changes_requested") return { ok: true };
  return { ok: false, reason: "The ads team can move creatives to Live, Paused or Rejected, or request changes before going live." };
}

/** Ads may toggle live state only on creatives that were sent to ads. Admin always may. */
export function canEditLiveState(role: Role, status: Status): boolean {
  if (role === "admin") return true;
  if (role === "ads") return ADS_ACTIVE_STATUSES.includes(status);
  return false;
}

export function allowedTargets(role: Role, from: Status, ctx: TransitionContext = { hasFile: true }): Status[] {
  return STATUSES.filter((s) => canTransition(role, from, s, ctx).ok);
}

export const KANBAN_COLUMNS: Status[] = ["requested", "submitted", "changes_requested", "approved", "sent_to_ads", "live"];
export const KANBAN_SIDE_COLUMN: Status[] = ["paused", "rejected"];
