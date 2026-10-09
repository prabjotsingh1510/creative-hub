/** Browser error reporting. Does nothing (and downloads nothing) unless NEXT_PUBLIC_SENTRY_DSN is set. */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0 });
  });
}
