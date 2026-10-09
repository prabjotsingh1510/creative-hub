"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Expand, Film, Play, RotateCcw, Upload } from "lucide-react";
import { registerVersion } from "@/actions/creatives";
import { Button } from "@/components/ui/button";
import { Lightbox } from "@/components/creatives/lightbox";
import { canUpload } from "@/lib/permissions";
import { forgetUpload, uploadWithThumb } from "@/lib/upload";
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
  const [playing, setPlaying] = useState<string | null>(null); // video loads only after a tap
  const [upload, setUpload] = useState<{ file: File; percent: number; state: "uploading" | "failed" | "saving"; error?: string } | null>(null);
  const [, startTransition] = useTransition();

  // Follow the newest version after an upload refresh.
  const [lastCurrent, setLastCurrent] = useState(currentVersionId);
  if (currentVersionId !== lastCurrent) {
    setLastCurrent(currentVersionId);
    setSelectedId(currentVersionId);
  }

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0];
  const isVideo = selected?.mime.startsWith("video/");
  const images = useMemo(
    () => versions.filter((v) => v.mime.startsWith("image/") && v.fileUrl).map((v) => ({ id: v.id, url: v.fileUrl!, label: `v${v.version_no}` })),
    [versions],
  );
  const lightboxIndex = Math.max(0, images.findIndex((i) => i.id === selected?.id));
  const [lbIndex, setLbIndex] = useState(0);

  async function run(file: File) {
    setUpload({ file, percent: 0, state: "uploading" });
    try {
      const { file_path, thumb_path } = await uploadWithThumb(creativeId, file, (percent) =>
        setUpload((u) => (u ? { ...u, percent } : u)),
      );
      setUpload((u) => (u ? { ...u, percent: 100, state: "saving" } : u));
      const res = await registerVersion({ creativeId, filePath: file_path, thumbPath: thumb_path, mime: file.type, size: file.size });
      if (!res.ok) throw new Error(res.error);
      toast.success("New version uploaded");
      forgetUpload(file);
      setUpload(null);
      startTransition(() => router.refresh());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUpload((u) => (u ? { ...u, state: "failed", error: message } : u));
      toast.error(message);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = validateCreativeFile(file);
    if (problem) return void toast.error(problem);
    void run(file);
  }

  const busy = upload?.state === "uploading" || upload?.state === "saving";

  return (
    <section aria-label="Preview and versions" className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-muted">
        {!selected ? (
          <div className="flex aspect-video flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
            <Film className="size-8" aria-hidden />
            No file uploaded yet.
          </div>
        ) : isVideo ? (
          playing === selected.id ? (
            <video key={selected.id} src={selected.fileUrl} poster={selected.thumbUrl} controls autoPlay playsInline preload="auto" className="max-h-[70vh] w-full bg-black" />
          ) : (
            <button type="button" onClick={() => setPlaying(selected.id)} aria-label={`Play version ${selected.version_no}`} className="group relative block aspect-video w-full bg-black outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {selected.thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.thumbUrl} alt="" decoding="async" className="size-full object-contain" />
              )}
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-105">
                  <Play className="size-7" aria-hidden />
                </span>
              </span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => {
              setLbIndex(lightboxIndex);
              setLightbox(true);
            }}
            className="group relative block w-full cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Open full-size preview"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.fileUrl} alt={`Version ${selected.version_no}`} decoding="async" className="mx-auto max-h-[70vh] w-auto object-contain" />
            <Expand className="absolute right-3 top-3 size-8 rounded bg-black/50 p-1.5 text-white opacity-80 transition group-hover:opacity-100" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Versions</h2>
        {canUpload(role) && (
          <>
            <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,image/*,video/*" onChange={onFile} />
            <Button className="ml-auto h-11 px-4" disabled={busy} onClick={() => input.current?.click()}>
              <Upload /> {busy ? "Uploading…" : versions.length ? "Upload new version" : "Upload creative"}
            </Button>
          </>
        )}
      </div>

      {upload && (
        <div className="space-y-1.5 rounded-lg border p-3 text-sm" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{upload.file.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {upload.state === "saving" ? "Saving…" : upload.state === "failed" ? "Failed" : `${upload.percent}%`}
            </span>
          </div>
          <progress className="h-2 w-full overflow-hidden rounded [&::-moz-progress-bar]:bg-foreground [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-foreground" value={upload.percent} max={100} aria-label="Upload progress" />
          {upload.state === "failed" && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-destructive">{upload.error}</span>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={() => void run(upload.file)}>
                  <RotateCcw /> Retry
                </Button>
                <Button variant="ghost" onClick={() => setUpload(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {versions.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {versions.map((v) => (
            <li key={v.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setSelectedId(v.id)}
                aria-pressed={v.id === selected?.id}
                className={cn("w-28 overflow-hidden rounded-lg border text-left text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50", v.id === selected?.id && "border-foreground")}
              >
                <span className="flex aspect-[4/3] items-center justify-center bg-muted">
                  {v.thumbUrl || (v.mime.startsWith("image/") && v.fileUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbUrl ?? v.fileUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
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

      <Lightbox items={images} index={lbIndex} open={lightbox} onOpenChange={setLightbox} onIndexChange={setLbIndex} />
    </section>
  );
}
