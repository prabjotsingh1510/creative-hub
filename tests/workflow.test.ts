import { describe, expect, it } from "vitest";
import { ADS_ACTIVE_STATUSES, allowedTargets, canEditLiveState, canTransition } from "../src/lib/workflow";
import { STATUSES, type Role, type Status } from "../src/lib/types";

const ok = (r: Role, from: Status, to: Status, hasFile = true) => canTransition(r, from, to, { hasFile }).ok;

describe("workflow transitions", () => {
  it("never allows a no-op move", () => {
    for (const r of ["admin", "creative", "ads"] as Role[]) {
      for (const s of STATUSES) expect(ok(r, s, s)).toBe(false);
    }
  });

  it("creative: only Requested/Changes requested -> Submitted, and only with a file", () => {
    expect(ok("creative", "requested", "submitted")).toBe(true);
    expect(ok("creative", "changes_requested", "submitted")).toBe(true);
    expect(ok("creative", "requested", "submitted", false)).toBe(false);
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (to === "submitted" && (from === "requested" || from === "changes_requested")) continue;
        expect(ok("creative", from, to)).toBe(false);
      }
    }
  });

  it("ads: Sent to ads -> Live/Paused/Rejected or request changes; nothing before sent to ads", () => {
    for (const to of ["live", "paused", "rejected"] as Status[]) expect(ok("ads", "sent_to_ads", to)).toBe(true);
    expect(ok("ads", "sent_to_ads", "changes_requested")).toBe(true);
    expect(ok("ads", "live", "paused")).toBe(true);
    expect(ok("ads", "paused", "live")).toBe(true);
    expect(ok("ads", "live", "changes_requested")).toBe(false);
    expect(ok("ads", "sent_to_ads", "approved")).toBe(false);
    for (const from of ["requested", "submitted", "changes_requested", "approved"] as Status[]) {
      for (const to of STATUSES) expect(ok("ads", from, to)).toBe(false);
    }
  });

  it("admin can move anything except to Submitted without a file", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to) continue;
        expect(ok("admin", from, to)).toBe(true);
      }
    }
    expect(ok("admin", "requested", "submitted", false)).toBe(false);
    expect(ok("admin", "requested", "approved", false)).toBe(true);
  });

  it("explains why a move is refused", () => {
    const r = canTransition("creative", "approved", "live");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/creative team/i);
    const r2 = canTransition("ads", "submitted", "live");
    if (!r2.ok) expect(r2.reason).toMatch(/sent to ads/i);
  });

  it("lists targets per role", () => {
    expect(allowedTargets("creative", "requested")).toEqual(["submitted"]);
    expect(allowedTargets("ads", "sent_to_ads")).toEqual(["changes_requested", "live", "paused", "rejected"]);
    expect(allowedTargets("ads", "approved")).toEqual([]);
    expect(allowedTargets("admin", "approved")).toHaveLength(STATUSES.length - 1);
  });

  it("ads may edit live state only once sent to ads", () => {
    for (const s of STATUSES) {
      expect(canEditLiveState("ads", s)).toBe(ADS_ACTIVE_STATUSES.includes(s));
      expect(canEditLiveState("admin", s)).toBe(true);
      expect(canEditLiveState("creative", s)).toBe(false);
    }
  });
});
