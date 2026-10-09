/** Sends an error to Sentry when it is configured; otherwise just logs it. Safe to call anywhere on the client. */
export function reportError(error: unknown) {
  console.error(error);
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }
}
