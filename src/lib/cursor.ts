/**
 * Keyset ("cursor") pagination helpers for lists ordered newest-first by (created_at, id).
 * The cursor is the last row already shown. `created_at` is kept as the raw database string
 * (microsecond precision) so no row is skipped or repeated at page boundaries.
 */
export interface Cursor {
  t: string;
  id: string | number;
}

export const PAGE = 30;

export const cursorOf = (row: { created_at: string; id: string | number }): Cursor => ({ t: row.created_at, id: row.id });

export function isCursor(v: unknown): v is Cursor {
  if (!v || typeof v !== "object") return false;
  const c = v as Cursor;
  return (
    typeof c.t === "string" &&
    /^\d{4}-\d{2}-\d{2}[T ][\d:.]+(Z|[+-]\d{2}(:?\d{2})?)?$/.test(c.t) &&
    (typeof c.id === "number" || (typeof c.id === "string" && /^[0-9a-f-]{8,40}$/i.test(c.id)))
  );
}

/** PostgREST `or` filter selecting rows strictly older than the cursor in (created_at desc, id desc) order. */
export function olderThan(cursor: Cursor): string {
  return `created_at.lt.${cursor.t},and(created_at.eq.${cursor.t},id.lt.${cursor.id})`;
}

/** Splits `limit + 1` fetched rows into the page and a hasMore flag. */
export function takePage<T>(rows: T[], limit: number = PAGE): { page: T[]; hasMore: boolean } {
  return { page: rows.slice(0, limit), hasMore: rows.length > limit };
}
