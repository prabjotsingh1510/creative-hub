"use client";
import { createClient } from "@/lib/supabase/client";

const THUMB_W = 480;

async function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/webp", 0.8));
}

function drawScaled(src: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, THUMB_W / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Client-side thumbnail: scaled webp for images, first-second poster frame for video. Null on failure. */
export async function makeThumbnail(file: File): Promise<Blob | null> {
  try {
    if (file.type.startsWith("image/")) {
      const bmp = await createImageBitmap(file);
      const blob = await canvasToWebp(drawScaled(bmp, bmp.width, bmp.height));
      bmp.close();
      return blob;
    }
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      try {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = url;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("video load failed"));
        });
        video.currentTime = Math.min(1, (video.duration || 1) / 2);
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });
        return await canvasToWebp(drawScaled(video, video.videoWidth, video.videoHeight));
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    // fall through: thumbnail is optional
  }
  return null;
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

/** Uploads file (+ thumbnail) to the private bucket under `prefix`. Returns storage paths. */
export async function uploadWithThumb(prefix: string, file: File) {
  const supabase = createClient();
  const id = crypto.randomUUID();
  const file_path = `${prefix}/${id}-${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from("creatives")
    .upload(file_path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);

  let thumb_path: string | null = null;
  const thumb = await makeThumbnail(file);
  if (thumb) {
    const p = `${prefix}/${id}-thumb.webp`;
    const { error: te } = await supabase.storage
      .from("creatives")
      .upload(p, thumb, { contentType: "image/webp", upsert: false });
    if (!te) thumb_path = p;
  }
  return { file_path, thumb_path };
}

export async function uploadAttachment(prefix: string, file: File) {
  const supabase = createClient();
  const path = `${prefix}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from("creatives")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
