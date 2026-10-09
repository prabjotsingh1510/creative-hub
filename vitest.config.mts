import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // RLS integration tests talk to a real (test) Supabase project, so allow for network latency.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      // Server-only modules need a runtime (Next/Supabase); they are covered by the RLS + e2e suites.
      exclude: ["src/lib/supabase/**", "src/lib/session.ts", "src/lib/creatives-data.ts", "src/lib/email/dispatch.ts", "src/lib/email/soon.ts", "src/lib/push/**", "src/lib/upload*.ts", "src/lib/rate-limit.ts", "src/lib/report-error.ts", "src/lib/icon.tsx"],
      reporter: ["text-summary", "text"],
    },
  },
});
