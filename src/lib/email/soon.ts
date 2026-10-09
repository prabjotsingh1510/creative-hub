import "server-only";
import { after } from "next/server";
import { dispatchPendingEmails } from "./dispatch";

/** Send queued notification emails right after the response is returned (non-blocking). */
export function emailSoon() {
  after(async () => {
    try {
      await dispatchPendingEmails();
    } catch (e) {
      console.error("[email] dispatch after action failed", e);
    }
  });
}
