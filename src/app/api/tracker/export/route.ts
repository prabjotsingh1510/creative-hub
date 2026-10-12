import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { todayIST } from "@/lib/time";
import { SHEET_HEADER, toSheetRow } from "@/lib/tracker";
import { loadTrackerRows, parseTrackerFilters } from "@/lib/tracker-data";

export const dynamic = "force-dynamic";

/** Ads Tracker as a CSV with the sheet's own column order (current filters applied). Admin and ads only. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  if (!me?.active || (me.role !== "admin" && me.role !== "ads")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filters = parseTrackerFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { rows, error } = await loadTrackerRows(filters, { limit: null });
  if (error) return NextResponse.json({ error }, { status: 500 });

  // Sheet order is oldest first; the tab itself is newest-updated first.
  const ordered = [...rows].sort((a, b) => a.sno - b.sno);
  return new NextResponse(toCsv(SHEET_HEADER, ordered.map(toSheetRow)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ads-tracker-${todayIST()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
