"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Both panels stay mounted so the realtime thread keeps its state while viewing the timeline. */
export function DetailTabs({ discussion, timeline, timelineCount }: { discussion: React.ReactNode; timeline: React.ReactNode; timelineCount: number }) {
  const [tab, setTab] = useState<"discussion" | "timeline">("discussion");
  const btn = (key: typeof tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`tab-${key}`}
      aria-selected={tab === key}
      aria-controls={`panel-${key}`}
      onClick={() => setTab(key)}
      className={cn("border-b-2 px-4 py-2 text-sm", tab === key ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Creative details" className="flex border-b">
        {btn("discussion", "Discussion")}
        {btn("timeline", `Timeline (${timelineCount})`)}
      </div>
      <div role="tabpanel" id="panel-discussion" aria-labelledby="tab-discussion" hidden={tab !== "discussion"}>{discussion}</div>
      <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline" hidden={tab !== "timeline"}>{timeline}</div>
    </div>
  );
}
