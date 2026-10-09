import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { formatIST, formatDateOnly, todayIST } from "@/lib/time";
import { LIVE_LABEL, STATUS_LABEL, type LiveState, type Status } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Admin-only CSV of every creative (including soft-deleted) with dates in IST and live details. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
  if (me?.role !== "admin" || !me.active) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ data: rows, error }, { data: people }] = await Promise.all([
    supabase.from("creatives_list").select("*").order("created_at", { ascending: false }).limit(20000),
    supabase.from("profiles").select("id, name"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const name = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));

  const header = [
    "Title", "Campaign", "Format", "Status", "Live state", "Due date", "Submitted at (IST)", "On time / late",
    "Latest version", "Comments", "Went live at (IST)", "Meta preview link", "Drive link", "DP notes",
    "Requested by", "Created at (IST)", "Deleted", "ID",
  ];
  const timing: Record<string, string> = { on_time: "On time", late: "Late", overdue: "Overdue", pending: "Pending", none: "No due date" };
  const body = (rows ?? []).map((r) => [
    r.title, r.campaign, r.format, STATUS_LABEL[r.status as Status] ?? r.status, LIVE_LABEL[r.live_state as LiveState] ?? r.live_state,
    r.due_date ? formatDateOnly(r.due_date) : "", r.submitted_at ? formatIST(r.submitted_at) : "", timing[r.timing] ?? r.timing,
    r.version_no ? `v${r.version_no}` : "", r.comment_count, r.went_live_at ? formatIST(r.went_live_at) : "",
    r.meta_preview_link, r.drive_link, r.ads_notes, name.get(r.created_by) ?? "", formatIST(r.created_at),
    r.deleted_at ? `Yes (${formatIST(r.deleted_at)})` : "No", r.id,
  ]);

  return new NextResponse(toCsv(header, body), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="creative-hub-${todayIST()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
