"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Last-resort boundary (replaces the root layout), so it brings its own <html>/<body> and plain styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError(error), [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0 }}>
        <div role="alert" style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#555" }}>Please try again. If it keeps happening, tell the admin{error.digest ? ` (reference ${error.digest})` : ""}.</p>
          <button onClick={reset} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #ccc", fontSize: 15 }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
