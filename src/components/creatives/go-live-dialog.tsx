"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { goLive } from "@/actions/creatives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromISTInput, toISTInput } from "@/lib/time";

/** Asks for the went-live time (prefilled now, IST) and the Meta preview link before a creative goes live. */
export function GoLiveDialog({
  open,
  onOpenChange,
  creativeId,
  title,
  defaultLink,
  onResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creativeId: string;
  title: string;
  defaultLink?: string | null;
  onResult?: (ok: boolean) => void;
}) {
  const [when, setWhen] = useState("");
  const [link, setLink] = useState(defaultLink ?? "");
  const [pending, start] = useTransition();

  // Prefill with "now" each time the dialog opens.
  useEffect(() => {
    if (open) {
      setWhen(toISTInput(new Date().toISOString()));
      setLink(defaultLink ?? "");
    }
  }, [open, defaultLink]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const iso = fromISTInput(when);
    if (!iso) {
      toast.error("Pick the went-live date and time");
      return;
    }
    start(async () => {
      const res = await goLive(creativeId, { wentLiveAt: iso, metaPreviewLink: link });
      if (!res.ok) {
        toast.error(res.error);
        onResult?.(false);
        return;
      }
      toast.success("Marked live");
      onOpenChange(false);
      onResult?.(true);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) onResult?.(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Take “{title}” live</DialogTitle>
            <DialogDescription>Record when it went live and where to preview it on Meta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="gl-when">Went live at (IST)</Label>
            <Input id="gl-when" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gl-link">Meta Ads preview link</Label>
            <Input id="gl-link" type="url" inputMode="url" required placeholder="https://fb.me/…" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Saving…" : "Go live"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
