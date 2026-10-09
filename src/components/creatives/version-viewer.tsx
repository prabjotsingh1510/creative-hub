"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Expand, Film, Upload } from "lucide-react";
import { registerVersion } from "@/actions/creatives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { canUpload } from "@/lib/permissions";
import { uploadWithThumb } from "@/lib/upload";
import { validateCreativeFile } from "@/lib/validators";
import { formatIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { CreativeVersion, Role } from "@/lib/types";

type V = CreativeVersion & { fileUrl?: string; thumbUrl?: string };

export function VersionViewer({
  creativeId,
  role,
  versions,
  currentVersionId,
}: {
  creativeId: string;
  role: Role;
  versions: V[];
  currentVersionId: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(currentVersionId ?? versions[0]?.id ?? null);
  const [lightbox, setLightbox] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();

  // Follow the newest version after an upload refresh.
  const [lastCurrent, setLastCurrent] = useState(currentVersionId);
  if (currentVersionId !== lastCurrent) {
    setLastCurrent(currentVersionId);
    setSelectedId(currentVersionId);
  }

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0];
  const isVideo = selected?.mime.startsWith("video/");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = validateCreativeFile(file);
    if (problem) return toast.error(problem);
    setUploading(true);
    try {
      const { file_path, thumb_path } = await uploadWithThumb(creativeId, file);
      const res = await registerVersion({
        creativeId,
        filePath: file_path,
        thumbPath: thumb_path,
        mime: file.type,
        size: file.size,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success("New version uploaded");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-label="Preview and versions" className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-muted">
        {!selected ? (
          <div className="flex aspect-video flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
            <Film className="size-8" aria-hidden />
            No file uploaded yet.
          </div>
        ) : isVideo ? (
          <video
            key={selected.id}
            src={selected.fileUrl}
            poster={selected.thumbUrl}
            controls
            playsInline
            preload="metadata"
            className="max-h-[70vh] w-full bg-black"
          />
        ) : (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="group relative block w-full cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Open full-size preview"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.fileUrl} alt={`Version ${selected.version_no}`} className="mx-auto max-h-[70vh] w-auto object-contain" />
            <Expand className="absolute right-3 top-3 size-5 rounded bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Versions</h2>
        {canUpload(role) && (
          <>
            <input
              ref={input}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
              onChange={onFile}
            />
            <Button className="ml-auto" size="lg" disabled={uploading} onClick={() => input.current?.click()}>
              <Upload /> {uploading ? "Uploading…" : versions.length ? "Upload new version" : "Upload creative"}
            </Button>
          </>
        )}
      </div>

      {versions.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {versions.map((v) => (
            <li key={v.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setSelectedId(v.id)}
                aria-pressed={v.id === selected?.id}
                className={cn(
                  "w-28 overflow-hidden rounded-lg border text-left text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  v.id === selected?.id && "border-foreground",
                )}
              >
                <span className="flex aspect-[4/3] items-center justify-center bg-muted">
                  {v.thumbUrl || (v.mime.startsWith("image/") && v.fileUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbUrl ?? v.fileUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Film className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </span>
                <span className="block p-1.5">
                  <span className="font-medium">v{v.version_no}</span>
                  {v.id === currentVersionId && <span className="ml-1 text-muted-foreground">latest</span>}
                  <span className="block text-muted-foreground">{formatIST(v.created_at, "d MMM, h:mm a")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl">
          <DialogTitle className="sr-only">Version {selected?.version_no} preview</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {selected && <img src={selected.fileUrl} alt={`Version ${selected.version_no}`} className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
