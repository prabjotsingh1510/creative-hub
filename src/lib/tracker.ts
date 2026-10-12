import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/time";
import { STATUS_LABEL, type Format, type LiveState, type Status } from "@/lib/types";

/** One row of the Ads Tracker tab (mirrors the "CreativeTracker_Dabble - Ads Tracker" sheet). Safe to send to the browser. */
export interface TrackerRow {
  id: string;
  sno: number;
  title: string;
  campaign: string | null;
  product_advertised: string | null;
  format: Format;
  status: Status;
  live_state: LiveState;
  went_live_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  meta_preview_link: string | null;
  meta_status_changed_at: string | null;
  platform: string;
  asset_type: "inhouse" | "parent" | null;
  creator_name: string | null;
  instagram_handle: string | null;
  ad_name: string | null;
  meta_campaign_name: string | null;
  ad_set_name: string | null;
  partnership_ad: boolean | null;
  language: string | null;
  face_in_first_3s: boolean | null;
  audio_hook_first_3s: boolean | null;
  text_in_first_3s: boolean | null;
  caption: string | null;
  landing_page_url: string | null;
  landing_page_type: string | null;
  cta_used: string | null;
  tracker_comments: string | null;
  pause_reason: string | null;
  version_no: number | null;
  deleted_at: string | null;
  thumbUrl?: string;
}

export const TRACKER_COLUMNS =
  "id,sno,title,campaign,product_advertised,format,status,live_state,went_live_at,submitted_at,created_at,updated_at," +
  "meta_preview_link,meta_status_changed_at,platform,asset_type,creator_name,instagram_handle,ad_name,meta_campaign_name," +
  "ad_set_name,partnership_ad,language,face_in_first_3s,audio_hook_first_3s,text_in_first_3s,caption,landing_page_url," +
  "landing_page_type,cta_used,tracker_comments,pause_reason,version_no,deleted_at,thumb_path,file_path,mime";

export const MEDIA_LABEL: Record<Format, string> = { video: "Video", image: "Static", carousel: "Carousel" };
export const ASSET_TYPE_LABEL = { inhouse: "Inhouse", parent: "Parent" } as const;
export const LANDING_PAGE_TYPES = ["Product Page", "Collection Page", "Home Page", "Other"] as const;

/** "Current Status on Meta" column. */
export const META_STATUS_LABEL: Record<LiveState, string> = {
  not_live: "",
  live: "Active",
  paused: "Inactive",
  rejected: "Rejected",
};

/** "Status changed to" column: only meaningful once the ad has left Active. */
export const statusChangedTo = (s: LiveState) => (s === "paused" ? "Paused" : s === "rejected" ? "Rejected" : "");

export const yesNoLabel = (v: boolean | null) => (v === null ? "" : v ? "Yes" : "No");

/** dd/MM/yyyy in IST, like the sheet. */
export function sheetDate(value: string | null | undefined): string {
  return value ? formatInTimeZone(new Date(value), TZ, "dd/MM/yyyy") : "";
}

/** Month column: month the asset was shared (falls back to when the request was created). */
export function sheetMonth(r: Pick<TrackerRow, "submitted_at" | "created_at">): string {
  return formatInTimeZone(new Date(r.submitted_at ?? r.created_at), TZ, "MMM");
}

/** Same column order and headers as the sheet, so exported rows paste straight back into it. */
export const SHEET_HEADER = [
  "S.NO.", "Asset Name", "Campaign", "Product Advertised", "Month", "Asset Shared Date", "Meta Ads Link", "Caption",
  "Platform", "Media Type", "Asset Type", "Creator Name", "Instagram Handle", "AD Name", "Campaign Name", "Ad set Name",
  "Partnership Ad", "Language", "Face in First 3 Sec", "Audio Hook in first 3 Sec", "Text in first 3 Sec", "Status",
  "Go-live Date", "Live Status (Yes / No)", "Current Status on Meta", "Status changed to", "Last Status changed on Date",
  "Reason if Paused", "Last Edited Date", "Landing Page URL", "Landing Page Type", "CTA Used", "Comments",
];

export function toSheetRow(r: TrackerRow): unknown[] {
  return [
    r.sno, r.title, r.campaign, r.product_advertised, sheetMonth(r), sheetDate(r.submitted_at), r.meta_preview_link, r.caption,
    r.platform, MEDIA_LABEL[r.format], r.asset_type ? ASSET_TYPE_LABEL[r.asset_type] : "", r.creator_name, r.instagram_handle,
    r.ad_name, r.meta_campaign_name, r.ad_set_name, yesNoLabel(r.partnership_ad), r.language, yesNoLabel(r.face_in_first_3s),
    yesNoLabel(r.audio_hook_first_3s), yesNoLabel(r.text_in_first_3s), STATUS_LABEL[r.status], sheetDate(r.went_live_at),
    r.live_state === "live" ? "Yes" : "No", META_STATUS_LABEL[r.live_state], statusChangedTo(r.live_state),
    sheetDate(r.meta_status_changed_at), r.pause_reason, sheetDate(r.updated_at), r.landing_page_url, r.landing_page_type,
    r.cta_used, r.tracker_comments,
  ];
}
