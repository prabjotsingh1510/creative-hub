"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, Radio } from "lucide-react";
import { setStatus } from "@/actions/creatives";
import { StatusBadge } from "@/components/creatives/badges";
import { GoLiveDialog } from "@/components/creatives/go-live-dialog";
import { Button } from "@/components/ui/button";
import { allowedTargets, canTransition } from "@/lib/workflow";
import { STATUS_LABEL, type Creative, type Role, type Status } from "@/lib/types";

/** Phone-only sticky bar: current status + the actions this role can take (status, go live, comment). */
export function MobileActionBar({ creative: c, role }: { creative: Creative; role: Role }) {
  const router = useRouter();
  const [liveOpen, setLiveOpen] = useState(false);
  const [pending, start] = useTransition();
  const ctx = { hasFile: !!c.current_version_id };
  const targets = c.deleted_at ? [] : allowedTargets(role, c.status, ctx).filter((s) => s !== "live");
  const canGoLive = !c.deleted_at && canTransition(role, c.status, "live", ctx).ok;

  function move(to: Status) {
    start(async () => {
      const res = await setStatus(c.id, to);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Moved to ${STATUS_LABEL[to]}`);
      router.refresh();
    });
  }

  return (
    <div className="sticky top-14 z-20 -mx-4 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur lg:hidden" role="region" aria-label="Actions">
      <GoLiveDialog open={liveOpen} onOpenChange={setLiveOpen} creativeId={c.id} title={c.title} defaultLink={c.meta_preview_link} onResult={(ok) => ok && router.refresh()} />
      <StatusBadge status={c.status} />
      {targets.length > 0 && (
        <select
          aria-label="Move to status"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
          value=""
          disabled={pending}
          onChange={(e) => e.target.value && move(e.target.value as Status)}
        >
          <option value="">Move to…</option>
          {targets.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      )}
      {canGoLive && (
        <Button className="h-11 shrink-0" onClick={() => setLiveOpen(true)}>
          <Radio /> Go live
        </Button>
      )}
      <Button
        variant="outline"
        className="ml-auto h-11 shrink-0"
        aria-label="Write a comment"
        onClick={() => {
          const el = document.getElementById("comment-composer");
          el?.scrollIntoView({ block: "center" });
          (el as HTMLTextAreaElement | null)?.focus();
        }}
      >
        <MessageSquare />
      </Button>
    </div>
  );
}
