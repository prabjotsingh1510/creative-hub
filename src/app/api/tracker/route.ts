import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TRACKER_PAGE_SIZE, loadTrackerRows, parseTrackerFilters } from "@/lib/tracker-data";

export const dynamic = "force-dynamic";

/** Next page of the Ads Tracker (same filters/sort as the page). Requires a signed-in user; RLS applies. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const offset = Math.max(0, Math.min(Number(sp.get("offset")) || 0, 10_000));
  const { rows, hasMore, error } = await loadTrackerRows(parseTrackerFilters(Object.fromEntries(sp)), {
    offset,
    limit: TRACKER_PAGE_SIZE,
  });
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ rows, hasMore });
}
