import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPendingEmails, sendDigests } from "@/lib/email/dispatch";
import { dispatchPendingPushes } from "@/lib/push/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed when not configured
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Idempotent scheduler tick: creates due/overdue reminders (once each), sends pending emails,
 * and sends daily digests. Safe to call from several schedulers (Vercel Cron, pg_cron, curl).
 */
async function run(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: reminders, error } = await admin.rpc("generate_due_reminders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const emails = await dispatchPendingEmails(100);
  const pushes = await dispatchPendingPushes(100);
  const digests = await sendDigests();
  return NextResponse.json({ reminders: reminders ?? 0, emails, pushes, digests });
}

export const GET = run;
export const POST = run;
