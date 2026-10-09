"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePreferences } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_TYPES, PREF_LABEL, type NotificationType } from "@/lib/notifications";

export function PreferencesForm({
  initialEmail,
  initialDigest,
}: {
  initialEmail: Record<NotificationType, boolean>;
  initialDigest: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [digest, setDigest] = useState(initialDigest);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await savePreferences({ email, dailyDigest: digest });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Preferences saved");
    });
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-xl border bg-card">
        {NOTIFICATION_TYPES.map((t) => (
          <li key={t}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{PREF_LABEL[t].label}</span>
                <span className="block text-xs text-muted-foreground">{PREF_LABEL[t].hint}</span>
              </span>
              <input
                type="checkbox"
                className="size-5 accent-foreground"
                checked={email[t]}
                onChange={(e) => setEmail((p) => ({ ...p, [t]: e.target.checked }))}
                aria-label={`Email me about ${PREF_LABEL[t].label}`}
              />
            </label>
          </li>
        ))}
      </ul>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Daily digest</span>
          <span className="block text-xs text-muted-foreground">
            One summary email around 9:00 AM IST with unread items and what’s waiting on you.
          </span>
        </span>
        <input type="checkbox" className="size-5 accent-foreground" checked={digest} onChange={(e) => setDigest(e.target.checked)} aria-label="Send me a daily digest" />
      </label>
      <Button size="lg" className="w-full" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </div>
  );
}
