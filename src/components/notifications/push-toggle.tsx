"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Turns push notifications on/off for THIS device. Only rendered when the server has VAPID keys. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [iosBrowser, setIosBrowser] = useState(false);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIosBrowser(ios && !standalone);
    if (!ok) return;
    navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription()).then((sub) => setEnabled(!!sub)).catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser settings, then try again.");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error("Couldn’t save this device. Try again.");
      setEnabled(true);
      toast.success("Push notifications are on for this device");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn’t turn on push");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Push notifications are off for this device");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Push notifications on this device</div>
          <div className="text-xs text-muted-foreground">Alerts on your phone or computer even when Creative Hub is closed.</div>
        </div>
        <Button variant={enabled ? "outline" : "default"} disabled={!supported || busy || iosBrowser} onClick={() => (enabled ? void disable() : void enable())}>
          {enabled ? "Turn off" : "Turn on"}
        </Button>
      </div>
      {!supported && <p className="text-xs text-muted-foreground">This browser doesn’t support push notifications.</p>}
      {iosBrowser && (
        <p className="text-xs text-muted-foreground">
          On iPhone/iPad, push only works after you add Creative Hub to your Home Screen (Share → Add to Home Screen, iOS 16.4 or newer) and open it from there.
        </p>
      )}
    </div>
  );
}
