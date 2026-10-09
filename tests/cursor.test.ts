import { describe, expect, it } from "vitest";
import { cursorOf, isCursor, olderThan, takePage } from "../src/lib/cursor";

describe("cursor pagination", () => {
  it("builds a keyset filter from the last row", () => {
    const c = cursorOf({ created_at: "2026-10-09T13:41:11.123456+00:00", id: "abc-123" });
    expect(olderThan(c)).toBe("created_at.lt.2026-10-09T13:41:11.123456+00:00,and(created_at.eq.2026-10-09T13:41:11.123456+00:00,id.lt.abc-123)");
  });

  it("accepts real cursors and rejects injection attempts", () => {
    expect(isCursor({ t: "2026-10-09T13:41:11.123456+00:00", id: "123e4567-e89b-12d3-a456-426614174000" })).toBe(true);
    expect(isCursor({ t: "2026-10-09T13:41:11Z", id: 42 })).toBe(true);
    expect(isCursor({ t: "x),or(true", id: 1 })).toBe(false);
    expect(isCursor({ t: "2026-10-09T13:41:11Z", id: "1),or(id.gt.0" })).toBe(false);
    expect(isCursor(null)).toBe(false);
    expect(isCursor({ t: 5, id: 1 })).toBe(false);
  });

  it("splits limit+1 rows into a page and hasMore", () => {
    expect(takePage([1, 2, 3], 2)).toEqual({ page: [1, 2], hasMore: true });
    expect(takePage([1, 2], 2)).toEqual({ page: [1, 2], hasMore: false });
    expect(takePage([], 2)).toEqual({ page: [], hasMore: false });
  });
});
