import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, signPaths } from "@/lib/session";
import { StatusBadge, LiveBadge, TimelinessBadge } from "@/components/creatives/badges";
import { VersionViewer } from "@/components/creatives/version-viewer";
import { DetailsPanel } from "@/components/creatives/details-panel";
import { CommentThread } from "@/components/comments/comment-thread";
import { ActivityLog } from "@/components/creatives/activity-log";
import { DetailTabs } from "@/components/creatives/detail-tabs";
import { PAGE, cursorOf, takePage } from "@/lib/cursor";
import { MobileActionBar } from "@/components/creatives/mobile-action-bar";
import type {
  ActivityRow,
  CommentAttachment,
  CommentRow,
  Creative,
  CreativeVersion,
  Profile,
} from "@/lib/types";

export default async function CreativePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ comment?: string }>;
}) {
  const { id } = await params;
  const { comment: highlightComment } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: creative } = await supabase.from("creatives").select("*").eq("id", id).maybeSingle();
  if (!creative) notFound();
  const c = creative as Creative;

  const [versionsRes, commentsRes, activityRes, profilesRes] = await Promise.all([
    supabase.from("creative_versions").select("*").eq("creative_id", id).order("version_no", { ascending: false }),
    supabase.from("comments").select("*, comment_attachments(*)").eq("creative_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE + 1),
    supabase.from("activity_log").select("*").eq("creative_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE + 1),
    supabase.from("profiles").select("id,name,role,team,avatar_url,email,active").eq("active", true),
  ]);

  const versions = (versionsRes.data ?? []) as CreativeVersion[];
  const commentPage = takePage((commentsRes.data ?? []) as (CommentRow & { comment_attachments: CommentAttachment[] })[]);
  const comments = commentPage.page.reverse(); // newest 30, shown oldest-first
  const activityPage = takePage((activityRes.data ?? []) as ActivityRow[]);
  const activity = activityPage.page;
  const people = (profilesRes.data ?? []) as Profile[];

  const urls = await signPaths([
    ...versions.flatMap((v) => [v.file_path, v.thumb_path]),
    ...comments.flatMap((cm) => cm.comment_attachments.map((a) => a.path)),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/creatives" aria-label="Back to creatives" className="rounded-md p-1.5 hover:bg-muted">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-semibold">{c.title}</h1>
        {c.deleted_at && <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Deleted</span>}
        <StatusBadge status={c.status} />
        <LiveBadge state={c.live_state} />
        <TimelinessBadge due={c.due_date} submittedAt={c.submitted_at} />
      </div>

      <MobileActionBar creative={c} role={profile.role} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <VersionViewer
          creativeId={c.id}
          role={profile.role}
          versions={versions.map((v) => ({
            ...v,
            fileUrl: urls[v.file_path],
            thumbUrl: v.thumb_path ? urls[v.thumb_path] : undefined,
          }))}
          currentVersionId={c.current_version_id}
        />
        <DetailsPanel creative={c} role={profile.role} />
      </div>

      <DetailTabs
        timelineCount={activity.length}
        discussion={
          <CommentThread
            creativeId={c.id}
            me={profile}
            people={people}
            highlightId={highlightComment}
            hasEarlier={commentPage.hasMore}
            earlierCursor={comments.length ? cursorOf(comments[0]) : null}
            versions={versions.map((v) => ({ id: v.id, version_no: v.version_no }))}
            initial={comments.map((cm) => ({
              ...cm,
              attachments: cm.comment_attachments.map((a) => ({ ...a, url: urls[a.path] })),
            }))}
          />
        }
        timeline={<ActivityLog creativeId={c.id} rows={activity} people={people} hasMore={activityPage.hasMore} />}
      />
    </div>
  );
}
