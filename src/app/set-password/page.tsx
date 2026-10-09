"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.replace("/creatives");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Set your password</h1>
          <p className="text-sm text-muted-foreground">Welcome to Creative Hub. Choose a password to finish setup.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>
      </form>
    </main>
  );
}
