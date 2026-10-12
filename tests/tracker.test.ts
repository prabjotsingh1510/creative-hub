import { describe, expect, it } from "vitest";
import { SHEET_HEADER, sheetDate, sheetMonth, toSheetRow, type TrackerRow } from "@/lib/tracker";
import { trackerFieldsSchema } from "@/lib/validators";

const base: TrackerRow = {
  id: "1", sno: 7, title: "DP_Vid_Test", campaign: "BAU", product_advertised: "Finger Paints", format: "video",
  status: "live", live_state: "live", went_live_at: "2026-10-01T05:00:00Z", submitted_at: "2026-09-30T20:00:00Z",
  created_at: "2026-09-29T00:00:00Z", updated_at: "2026-10-02T05:00:00Z", meta_preview_link: "https://fb.me/x",
  meta_status_changed_at: null, platform: "Meta", asset_type: "inhouse", creator_name: null, instagram_handle: null,
  ad_name: "ad", meta_campaign_name: "camp", ad_set_name: "set", partnership_ad: false, language: null,
  face_in_first_3s: true, audio_hook_first_3s: null, text_in_first_3s: null, caption: null, landing_page_url: null,
  landing_page_type: "Product Page", cta_used: null, tracker_comments: null, pause_reason: null, version_no: 1, deleted_at: null,
};

describe("ads tracker sheet mapping", () => {
  it("row has one cell per sheet header", () => {
    expect(toSheetRow(base)).toHaveLength(SHEET_HEADER.length);
  });
  it("uses IST calendar dates and month of the shared date", () => {
    // 20:00Z on 30 Sep is 01:30 IST on 1 Oct
    expect(sheetDate(base.submitted_at)).toBe("01/10/2026");
    expect(sheetMonth(base)).toBe("Oct");
  });
  it("maps live state and media type like the sheet", () => {
    const row = toSheetRow(base);
    expect(row[SHEET_HEADER.indexOf("Live Status (Yes / No)")]).toBe("Yes");
    expect(row[SHEET_HEADER.indexOf("Current Status on Meta")]).toBe("Active");
    expect(toSheetRow({ ...base, format: "image", live_state: "paused" })[SHEET_HEADER.indexOf("Media Type")]).toBe("Static");
  });
});

describe("trackerFieldsSchema", () => {
  const empty = {
    product_advertised: "", asset_type: "", creator_name: "", instagram_handle: "", ad_name: "", meta_campaign_name: "",
    ad_set_name: "", partnership_ad: "", language: "", face_in_first_3s: "", audio_hook_first_3s: "", text_in_first_3s: "",
    caption: "", landing_page_url: "", landing_page_type: "", cta_used: "", pause_reason: "", tracker_comments: "",
  };
  it("turns blanks into nulls and yes/no into booleans", () => {
    const r = trackerFieldsSchema.parse({ ...empty, partnership_ad: "yes", face_in_first_3s: "no", ad_name: " x " });
    expect(r.partnership_ad).toBe(true);
    expect(r.face_in_first_3s).toBe(false);
    expect(r.audio_hook_first_3s).toBeNull();
    expect(r.ad_name).toBe("x");
    expect(r.asset_type).toBeNull();
  });
  it("rejects non-http landing pages", () => {
    expect(trackerFieldsSchema.safeParse({ ...empty, landing_page_url: "javascript:alert(1)" }).success).toBe(false);
  });
});
