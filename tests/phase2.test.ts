import { describe, expect, it } from "vitest";
import {
  filtersToParams,
  hasActiveFilters,
  isQuickFilterActive,
  parseFilters,
  quickFilters,
  sanitizeSearch,
  waitingStatuses,
} from "../src/lib/filters";
import {
  NOTIFICATION_TYPES,
  defaultEmailPref,
  describeNotification,
  notificationHref,
} from "../src/lib/notifications";
import { describeActivity, activityGroupOf } from "../src/lib/activity";
import { renderDigestEmail, renderNotificationEmail } from "../src/lib/email/templates";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("filters", () => {
  it("round-trips through URL params and drops defaults", () => {
    const f = parseFilters({ status: "submitted,approved", sort: "due", view: "table", dueFrom: "2026-03-01", q: " hero " });
    expect(f).toMatchObject({ status: ["submitted", "approved"], sort: "due", view: "table", dueFrom: "2026-03-01", q: "hero" });
    const again = parseFilters(Object.fromEntries(filtersToParams(f)));
    expect(again).toEqual(f);
    expect(filtersToParams(parseFilters({})).toString()).toBe("");
  });

  it("ignores invalid values", () => {
    const f = parseFilters({ status: "nope,approved", live: "bogus", uploader: "x", dueFrom: "yesterday", sort: "zzz", timing: "?" });
    expect(f.status).toEqual(["approved"]);
    expect(f.live).toEqual([]);
    expect(f.uploader).toBe("");
    expect(f.dueFrom).toBe("");
    expect(f.sort).toBe("newest");
    expect(f.timing).toBe("");
    expect(parseFilters({ uploader: UUID }).uploader).toBe(UUID);
  });

  it("knows when filters are active (view and sort don't count)", () => {
    expect(hasActiveFilters(parseFilters({ view: "table", sort: "due" }))).toBe(false);
    expect(hasActiveFilters(parseFilters({ timing: "late" }))).toBe(true);
  });

  it("maps 'waiting on me' per role", () => {
    expect(waitingStatuses("admin")).toEqual(["submitted"]);
    expect(waitingStatuses("creative")).toEqual(["requested", "changes_requested"]);
    expect(waitingStatuses("ads")).toEqual(["approved", "sent_to_ads"]);
  });

  it("detects the active quick filter", () => {
    const overdue = quickFilters("admin").find((q) => q.key === "overdue")!;
    expect(isQuickFilterActive(parseFilters({ timing: "overdue", sort: "due" }), overdue)).toBe(true);
    expect(isQuickFilterActive(parseFilters({}), overdue)).toBe(false);
  });

  it("strips characters that break search patterns", () => {
    expect(sanitizeSearch("50%_off,(sale)")).toBe("50  off  sale");
  });
});

describe("notifications", () => {
  it("defaults noisy events to no email", () => {
    expect(defaultEmailPref("mention")).toBe(true);
    expect(defaultEmailPref("status_changed")).toBe(true);
    expect(defaultEmailPref("comment")).toBe(false);
    expect(defaultEmailPref("reply")).toBe(false);
    expect(NOTIFICATION_TYPES).toHaveLength(10);
  });

  it("builds deep links to the exact creative, comment or message", () => {
    expect(notificationHref({ type: "mention", creative_id: "c1", comment_id: "m1", message_id: null, payload: {} })).toBe(
      "/creatives/c1?comment=m1#comment-m1",
    );
    expect(notificationHref({ type: "status_changed", creative_id: "c1", comment_id: null, message_id: null, payload: {} })).toBe("/creatives/c1");
    expect(notificationHref({ type: "channel_mention", creative_id: null, comment_id: null, message_id: "x", payload: { channel: "general" } })).toBe(
      "/channels/general?message=x",
    );
  });

  it("describes events readably", () => {
    expect(describeNotification({ type: "mention", payload: { title: "Hero" } }, "Rajat")).toBe("Rajat mentioned you on “Hero”");
    expect(describeNotification({ type: "status_changed", payload: { title: "Hero", to: "approved" } }, null)).toBe("“Hero” moved to Approved");
    expect(describeNotification({ type: "live_state_changed", payload: { title: "Hero", to: "rejected" } }, null)).toBe("“Hero” is now Rejected by Meta");
  });
});

describe("activity", () => {
  it("describes field edits old -> new in IST", () => {
    expect(describeActivity({ action: "field_changed", from_value: "2026-03-01", to_value: "2026-03-05", meta: { field: "due_date" } })).toBe(
      "changed due date: 1 Mar 2026 → 5 Mar 2026",
    );
    expect(describeActivity({ action: "pinned", from_value: null, to_value: null, meta: {} })).toBe("pinned a comment");
    expect(activityGroupOf("field_changed")).toBe("edits");
    expect(activityGroupOf("version_uploaded")).toBe("uploads");
  });
});

describe("email templates", () => {
  it("escapes user content and includes a deep link", () => {
    const mail = renderNotificationEmail(
      { type: "mention", creative_id: "c1", comment_id: "m1", message_id: null, payload: { title: "A<b>", snippet: "<script>x</script>" } },
      "Prabjot",
    );
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("/creatives/c1?comment=m1#comment-m1");
    expect(mail.text).toContain("/creatives/c1");
  });

  it("renders a digest", () => {
    const mail = renderDigestEmail({ name: "Raj", items: [{ text: "X", href: "/creatives/1" }], waiting: 2 });
    expect(mail.subject).toContain("2 waiting on you");
    expect(mail.html).toContain("/creatives/1");
  });
});
