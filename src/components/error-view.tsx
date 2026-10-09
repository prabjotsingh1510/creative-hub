"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/report-error";

export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        We couldn’t load this page. Your data is safe. Try again, and if it keeps happening tell the admin
        {error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <div className="flex gap-2">
        <Button size="lg" onClick={reset}>Try again</Button>
        <a href="/dashboard" className="inline-flex h-9 items-center rounded-lg border px-4 text-sm hover:bg-muted">Go to dashboard</a>
      </div>
    </div>
  );
}
