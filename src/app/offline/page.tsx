export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">You’re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Creative Hub needs a connection to show live creatives and messages. Check your signal and try again.
      </p>
      <a href="/dashboard" className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted">
        Try again
      </a>
    </main>
  );
}
