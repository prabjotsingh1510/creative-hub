"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createRequest } from "@/actions/creatives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RequestForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [format, setFormat] = useState<"image" | "video" | "carousel">("image");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const links = String(f.get("links") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    start(async () => {
      const res = await createRequest({
        title: String(f.get("title") ?? ""),
        campaign: String(f.get("campaign") ?? ""),
        format,
        brief: String(f.get("brief") ?? ""),
        due_date: String(f.get("due_date") ?? ""),
        reference_links: links,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Request created");
      router.push(`/creatives/${res.data!.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={200} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="campaign">Campaign / product</Label>
          <Input id="campaign" name="campaign" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="due_date">Date to be submitted</Label>
          <Input id="due_date" name="due_date" type="date" />
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Format</legend>
        <div className="flex gap-2">
          {(["image", "video", "carousel"] as const).map((f) => (
            <label key={f} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm capitalize ${format === f ? "border-foreground bg-muted" : ""}`}>
              <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} className="sr-only" />
              {f}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="brief">Brief</Label>
        <Textarea id="brief" name="brief" rows={5} maxLength={5000} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="links">Reference links (one per line)</Label>
        <Textarea id="links" name="links" rows={3} placeholder="https://…" />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create request"}
      </Button>
    </form>
  );
}
