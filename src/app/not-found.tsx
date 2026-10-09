import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That page doesn’t exist, or you don’t have access to it.</p>
      <Link href="/dashboard" className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted">Back to dashboard</Link>
    </main>
  );
}
