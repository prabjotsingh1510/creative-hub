import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const TZ = "Asia/Kolkata";

export function formatIST(value: string | Date | null | undefined, pattern = "d MMM yyyy, h:mm a") {
  if (!value) return "—";
  return formatInTimeZone(new Date(value), TZ, pattern) + " IST";
}

/** Date-only (YYYY-MM-DD) values are calendar dates, not instants. */
export function formatDateOnly(value: string | null | undefined) {
  if (!value) return "—";
  return formatInTimeZone(new Date(`${value}T00:00:00+05:30`), TZ, "d MMM yyyy");
}

/** UTC ISO -> value for <input type="datetime-local"> in IST. */
export function toISTInput(value: string | null | undefined) {
  if (!value) return "";
  return formatInTimeZone(new Date(value), TZ, "yyyy-MM-dd'T'HH:mm");
}

/** <input type="datetime-local"> value (interpreted as IST) -> UTC ISO. */
export function fromISTInput(value: string | null | undefined) {
  if (!value) return null;
  return fromZonedTime(value, TZ).toISOString();
}

export function todayIST() {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
}

export type Timeliness =
  | { kind: "none" }
  | { kind: "on_time" | "late"; days: number }
  | { kind: "overdue"; days: number }
  | { kind: "pending" };

/** Compare due date (IST end of day) with actual submission, or with now when not submitted. */
export function timeliness(
  due: string | null,
  submittedAt: string | null,
  now: Date = new Date(),
): Timeliness {
  if (!due) return { kind: "none" };
  const deadline = new Date(`${due}T23:59:59.999+05:30`).getTime();
  const DAY = 86_400_000;
  if (submittedAt) {
    const t = new Date(submittedAt).getTime();
    return t <= deadline
      ? { kind: "on_time", days: 0 }
      : { kind: "late", days: Math.max(1, Math.ceil((t - deadline) / DAY)) };
  }
  return now.getTime() > deadline
    ? { kind: "overdue", days: Math.max(1, Math.ceil((now.getTime() - deadline) / DAY)) }
    : { kind: "pending" };
}

export { toZonedTime };
