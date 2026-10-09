import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const subscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(5).max(100) }),
});

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Saves this device's push subscription for the signed-in user. */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = subscription.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const admin = createAdminClient();
  // An endpoint identifies one browser profile; re-subscribing moves it to the current user.
  await admin.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  const { error } = await admin.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Removes this device's subscription (own rows only). */
export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
