import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Invite / recovery email links point here (see README: customise the Supabase email
 * templates to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/set-password";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/set-password";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(safeNext, origin));
  }
  return NextResponse.redirect(new URL("/login?error=invalid_link", origin));
}
