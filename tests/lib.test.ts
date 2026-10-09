import { describe, expect, it } from "vitest";
import { allowedNextStatuses, canEditAdsFields, canEditCreativeFields, canUpload } from "../src/lib/permissions";
import { fromISTInput, timeliness, toISTInput } from "../src/lib/time";
import { requestSchema, validateAttachment, validateCreativeFile } from "../src/lib/validators";

describe("permissions", () => {
  it("restricts fields by role", () => {
    expect(canUpload("ads")).toBe(false);
    expect(canUpload("creative")).toBe(true);
    expect(canEditAdsFields("creative")).toBe(false);
    expect(canEditAdsFields("ads")).toBe(true);
    expect(canEditCreativeFields("ads")).toBe(false);
  });

  it("limits status transitions", () => {
    expect(allowedNextStatuses("creative", "requested")).toEqual(["submitted"]);
    expect(allowedNextStatuses("creative", "approved")).toEqual([]);
    expect(allowedNextStatuses("ads", "sent_to_ads")).toContain("live");
    expect(allowedNextStatuses("ads", "sent_to_ads")).not.toContain("approved");
    expect(allowedNextStatuses("admin", "submitted")).not.toContain("submitted");
  });
});

describe("time (IST)", () => {
  it("round-trips datetime-local through IST", () => {
    const utc = fromISTInput("2026-03-01T10:30")!;
    expect(utc).toBe("2026-03-01T05:00:00.000Z");
    expect(toISTInput(utc)).toBe("2026-03-01T10:30");
  });

  it("judges lateness against end of IST due day", () => {
    // 23:30 IST on due day = 18:00Z -> still on time
    expect(timeliness("2026-03-01", "2026-03-01T18:00:00Z").kind).toBe("on_time");
    // 00:30 IST next day = 19:00Z -> late
    expect(timeliness("2026-03-01", "2026-03-01T19:00:00Z")).toMatchObject({ kind: "late", days: 1 });
    expect(timeliness("2026-03-01", null, new Date("2026-03-05T00:00:00Z")).kind).toBe("overdue");
    expect(timeliness("2026-03-01", null, new Date("2026-02-20T00:00:00Z")).kind).toBe("pending");
    expect(timeliness(null, null).kind).toBe("none");
  });
});

describe("validators", () => {
  it("enforces upload type and size limits", () => {
    expect(validateCreativeFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateCreativeFile({ type: "image/png", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(validateCreativeFile({ type: "video/mp4", size: 60 * 1024 * 1024 })).toMatch(/Drive/);
    expect(validateCreativeFile({ type: "application/zip", size: 1 })).toMatch(/Unsupported/);
    expect(validateAttachment({ type: "video/mp4", size: 1 })).not.toBeNull();
  });

  it("normalises request input", () => {
    const r = requestSchema.parse({ title: " Hi ", campaign: "", format: "image", brief: "", due_date: "" });
    expect(r).toMatchObject({ title: "Hi", campaign: null, brief: null, due_date: null, reference_links: [] });
    expect(requestSchema.safeParse({ title: "", format: "image", campaign: "", brief: "", due_date: "" }).success).toBe(false);
  });
});
