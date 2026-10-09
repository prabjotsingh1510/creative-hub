import "server-only";
import { after } from "next/server";
import { dispatchPendingEmails } from "./dispatch";
import { dispatchPendingPushes } from "@/lib/push/dispatch";

/** Send queued notification emails (and push, when enabled) right after the response is returned (non-blocking). */
export function emailSoon() {
  after(async () => {
    try {
      await dispatchPendingEmails();
      await dispatchPendingPushes();
    } catch (e) {
      console.error("[email] dispatch after action failed", e);
    }
  });
}
