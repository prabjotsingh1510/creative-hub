import { z } from "zod";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const ATTACHMENT_TYPES = [...IMAGE_TYPES, "application/pdf"];

export function validateCreativeFile(file: { type: string; size: number }): string | null {
  if (IMAGE_TYPES.includes(file.type)) {
    return file.size > MAX_IMAGE_BYTES ? "Images must be 10 MB or smaller." : null;
  }
  if (VIDEO_TYPES.includes(file.type)) {
    return file.size > MAX_VIDEO_BYTES
      ? "Videos must be 50 MB or smaller. Upload a compressed preview here and put the original in the Drive link."
      : null;
  }
  return "Unsupported file type. Use JPG, PNG, WebP, GIF, MP4, MOV or WebM.";
}

export function validateAttachment(file: { type: string; size: number }): string | null {
  if (!ATTACHMENT_TYPES.includes(file.type)) return "Attachments must be an image or PDF.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Attachments must be 10 MB or smaller.";
  return null;
}

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Must start with http:// or https://")
  .transform((v) => (v === "" ? null : v));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const dateOnly = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date")
  .transform((v) => (v === "" ? null : v));

export const requestSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  campaign: optionalText(120),
  format: z.enum(["image", "video", "carousel"]),
  brief: optionalText(5000),
  due_date: dateOnly,
  reference_links: z.array(z.string().trim().url()).max(10).default([]),
});

export const creativeFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  campaign: optionalText(120),
  format: z.enum(["image", "video", "carousel"]),
  drive_link: optionalUrl,
  copy_notes: optionalText(5000),
});

export const adsFieldsSchema = z.object({
  live_state: z.enum(["not_live", "live", "paused", "rejected"]),
  went_live_at: z.string().datetime().nullable(),
  meta_preview_link: optionalUrl,
  ads_notes: optionalText(5000),
});

export const inviteSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "creative", "ads"]),
  team: optionalText(120),
});

export const statusSchema = z.enum([
  "requested",
  "submitted",
  "changes_requested",
  "approved",
  "sent_to_ads",
  "live",
  "paused",
  "rejected",
]);
