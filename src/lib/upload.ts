"use client";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { checkContent } from "@/lib/sniff";

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

/** Reads the first bytes and checks they match the declared type. Returns an error message or null. */
export async function sniffFile(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  return checkContent(file.type, head);
}

/**
 * Resumable upload to Supabase Storage (TUS, 6 MB chunks): shows progress, retries dropped connections
 * automatically and can resume the same file if the user retries after a failure.
 */
export async function uploadResumable(path: string, file: File, onProgress?: (percent: number) => void): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired. Please sign in again.");
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: "creatives", objectName: path, contentType: file.type, cacheControl: "3600" },
      onError: (err) => reject(new Error(err.message || "Upload failed")),
      onProgress: (sent, total) => onProgress?.(Math.round((sent / total) * 100)),
      onSuccess: () => resolve(),
    });
    // Resume a previous attempt of the same file if there is one.
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    }, () => upload.start());
  });
}

// A retry of the same File must reuse the same storage path so the resumable upload can continue.
const uploadIds = new WeakMap<File, string>();
export const forgetUpload = (file: File) => uploadIds.delete(file);

/** Uploads file (+ thumbnail) to the private bucket under `prefix`. Returns storage paths. */
export async function uploadWithThumb(prefix: string, file: File, onProgress?: (percent: number) => void) {
  const supabase = createClient();
  const bad = await sniffFile(file);
  if (bad) throw new Error(bad);
  const id = uploadIds.get(file) ?? crypto.randomUUID();
  uploadIds.set(file, id);
  const file_path = `${prefix}/${id}-${safeName(file.name)}`;
  await uploadResumable(file_path, file, onProgress);

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
  const bad = await sniffFile(file);
  if (bad) throw new Error(`${file.name}: ${bad}`);
  const path = `${prefix}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from("creatives")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
