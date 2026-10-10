import { beforeAll, describe, expect, it } from "vitest";
import { dbEnabled, denied, forceStatus, makeCreative, makeUser, service, uploadVersion, type TestUser } from "./helpers";

/**
 * Role matrix for creatives, versions, DP fields and workflow transitions, executed against the real
 * database (RLS + triggers). Skipped automatically when no test project is configured.
 */
describe.skipIf(!dbEnabled)("RLS: creatives, versions, DP fields, workflow", () => {
  let admin: TestUser, creative: TestUser, ads: TestUser, inactive: TestUser;

  beforeAll(async () => {
    [admin, creative, ads, inactive] = await Promise.all([makeUser("admin"), makeUser("creative"), makeUser("ads"), makeUser("creative", "inactive-")]);
    await service().from("profiles").update({ active: false }).eq("id", inactive.id);
  });

  describe("creating and editing", () => {
    it("only admin can create a request", async () => {
      expect(denied(await creative.client.from("creatives").insert({ title: "x", created_by: creative.id }).select())).toBe(true);
      expect(denied(await ads.client.from("creatives").insert({ title: "x", created_by: ads.id }).select())).toBe(true);
      expect(denied(await admin.client.from("creatives").insert({ title: "[rls-test] ok", created_by: admin.id }).select())).toBe(false);
    });

    it("admin cannot create a request in someone else's name", async () => {
      expect(denied(await admin.client.from("creatives").insert({ title: "spoof", created_by: creative.id }).select())).toBe(true);
    });

    it("creative edits creative-team fields but not admin or DP fields", async () => {
      const id = await makeCreative(admin);
      expect((await creative.client.from("creatives").update({ title: "[rls-test] renamed", drive_link: "https://drive.example/x" }).eq("id", id)).error).toBeNull();
      for (const patch of [{ due_date: "2031-01-01" }, { brief: "hack" }, { live_state: "live" }, { meta_preview_link: "https://x.example" }, { ads_notes: "n" }, { created_by: creative.id }]) {
        expect((await creative.client.from("creatives").update(patch).eq("id", id)).error, JSON.stringify(patch)).not.toBeNull();
      }
    });

    it("ads edits DP fields but not creative-team or admin fields", async () => {
      const id = await makeCreative(admin);
      await forceStatus(id, { status: "sent_to_ads" });
      expect((await ads.client.from("creatives").update({ meta_preview_link: "https://fb.me/x", ads_notes: "ok" }).eq("id", id)).error).toBeNull();
      for (const patch of [{ title: "hack" }, { drive_link: "https://x.example" }, { due_date: "2031-01-01" }, { copy_notes: "x" }, { deleted_at: new Date().toISOString() }]) {
        expect((await ads.client.from("creatives").update(patch).eq("id", id)).error, JSON.stringify(patch)).not.toBeNull();
      }
    });

    it("admin can edit everything", async () => {
      const id = await makeCreative(admin);
      expect((await admin.client.from("creatives").update({ title: "[rls-test] admin", due_date: "2032-02-02", brief: "b", ads_notes: "n", meta_preview_link: "https://x.example" }).eq("id", id)).error).toBeNull();
    });

    it("a deactivated user can read and write nothing", async () => {
      const id = await makeCreative(admin);
      expect(denied(await inactive.client.from("creatives").select("id").eq("id", id))).toBe(true);
      expect(denied(await inactive.client.from("creatives").update({ title: "x" }).eq("id", id).select())).toBe(true);
    });
  });

  describe("soft delete", () => {
    it("only admin can delete or restore; others never see deleted creatives; nobody can hard-delete", async () => {
      const id = await makeCreative(admin);
      expect((await creative.client.from("creatives").update({ deleted_at: new Date().toISOString() }).eq("id", id)).error).not.toBeNull();
      expect((await ads.client.from("creatives").update({ deleted_at: new Date().toISOString() }).eq("id", id)).error).not.toBeNull();
      expect((await admin.client.from("creatives").update({ deleted_at: new Date().toISOString() }).eq("id", id)).error).toBeNull();
      expect(denied(await creative.client.from("creatives").select("id").eq("id", id))).toBe(true);
      expect(denied(await admin.client.from("creatives").select("id").eq("id", id))).toBe(false);
      for (const u of [creative, ads, admin]) {
        expect(denied(await u.client.from("creatives").delete().eq("id", id).select())).toBe(true);
      }
      expect((await admin.client.from("creatives").update({ deleted_at: null }).eq("id", id)).error).toBeNull();
      expect(denied(await creative.client.from("creatives").select("id").eq("id", id))).toBe(false);
    });
  });

  describe("versions", () => {
    it("creative and admin can upload; ads cannot; clients cannot touch versions directly", async () => {
      const id = await makeCreative(admin);
      const first = await uploadVersion(creative, id);
      expect(first.error).toBeNull();
      expect((await uploadVersion(admin, id)).error).toBeNull();
      expect((await uploadVersion(ads, id)).error).not.toBeNull();

      const { data: c } = await admin.client.from("creatives").select("status, submitted_at, current_version_id").eq("id", id).single();
      expect(c?.status).toBe("submitted"); // first upload auto-submits
      expect(c?.submitted_at).not.toBeNull();
      const { data: versions } = await admin.client.from("creative_versions").select("version_no").eq("creative_id", id).order("version_no");
      expect(versions?.map((v) => v.version_no)).toEqual([1, 2]);

      for (const u of [creative, ads, admin]) {
        expect((await u.client.from("creative_versions").insert({ creative_id: id, version_no: 9, file_path: "x", mime: "image/png", size_bytes: 1, uploaded_by: u.id })).error).not.toBeNull();
        expect(denied(await u.client.from("creative_versions").update({ file_path: "hacked" }).eq("creative_id", id).select())).toBe(true);
        expect(denied(await u.client.from("creative_versions").delete().eq("creative_id", id).select())).toBe(true);
      }
    });
  });

  describe("workflow transitions (migration 0009)", () => {
    it("creative cannot submit without a file, nor jump to later statuses", async () => {
      const id = await makeCreative(admin);
      expect((await creative.client.from("creatives").update({ status: "submitted" }).eq("id", id)).error).not.toBeNull();
      expect((await uploadVersion(creative, id)).error).toBeNull();
      for (const status of ["approved", "sent_to_ads", "live"]) {
        expect((await creative.client.from("creatives").update({ status }).eq("id", id)).error, status).not.toBeNull();
      }
    });

    it("creative can resubmit after changes were requested", async () => {
      const id = await makeCreative(admin);
      await uploadVersion(creative, id);
      expect((await admin.client.from("creatives").update({ status: "changes_requested" }).eq("id", id)).error).toBeNull();
      expect((await uploadVersion(creative, id)).error).toBeNull();
      const { data } = await admin.client.from("creatives").select("status").eq("id", id).single();
      expect(data?.status).toBe("submitted");
    });

    it("ads cannot act on creatives that are not yet approved", async () => {
      const id = await makeCreative(admin);
      await uploadVersion(creative, id);
      for (const patch of [{ status: "live" }, { status: "approved" }, { status: "changes_requested" }, { live_state: "live" }]) {
        expect((await ads.client.from("creatives").update(patch).eq("id", id)).error, JSON.stringify(patch)).not.toBeNull();
      }
    });

    it("ads can take an Approved creative live directly, or request changes, but not move it elsewhere", async () => {
      const id = await makeCreative(admin);
      await uploadVersion(creative, id);
      await forceStatus(id, { status: "approved" });
      for (const patch of [{ status: "requested" }, { status: "sent_to_ads" }, { status: "submitted" }]) {
        expect((await ads.client.from("creatives").update(patch).eq("id", id)).error, JSON.stringify(patch)).not.toBeNull();
      }
      expect((await ads.client.from("creatives").update({ live_state: "live", meta_preview_link: "https://fb.me/2" }).eq("id", id)).error).toBeNull();
      const { data } = await admin.client.from("creatives").select("status, went_live_at").eq("id", id).single();
      expect(data?.status).toBe("live");
      expect(data?.went_live_at).not.toBeNull();

      const id2 = await makeCreative(admin);
      await uploadVersion(creative, id2);
      await forceStatus(id2, { status: "approved" });
      expect((await ads.client.from("creatives").update({ status: "changes_requested" }).eq("id", id2)).error).toBeNull();
    });

    it("ads can go live / pause / reject / request changes once sent to ads; went_live_at is auto-set", async () => {
      const id = await makeCreative(admin);
      await uploadVersion(creative, id);
      await forceStatus(id, { status: "sent_to_ads" });
      expect((await ads.client.from("creatives").update({ live_state: "live", meta_preview_link: "https://fb.me/1" }).eq("id", id)).error).toBeNull();
      const { data } = await admin.client.from("creatives").select("status, went_live_at, is_live").eq("id", id).single();
      expect(data).toMatchObject({ status: "live", is_live: true });
      expect(data?.went_live_at).not.toBeNull();
      expect((await ads.client.from("creatives").update({ live_state: "paused" }).eq("id", id)).error).toBeNull();
      expect((await ads.client.from("creatives").update({ live_state: "rejected" }).eq("id", id)).error).toBeNull();

      const id2 = await makeCreative(admin);
      await uploadVersion(creative, id2);
      await forceStatus(id2, { status: "sent_to_ads" });
      expect((await ads.client.from("creatives").update({ status: "changes_requested" }).eq("id", id2)).error).toBeNull();
    });

    it("creative cannot touch live state at any status", async () => {
      const id = await makeCreative(admin);
      await forceStatus(id, { status: "sent_to_ads" });
      expect((await creative.client.from("creatives").update({ live_state: "live" }).eq("id", id)).error).not.toBeNull();
      expect((await creative.client.from("creatives").update({ status: "live" }).eq("id", id)).error).not.toBeNull();
    });

    it("admin can move to any status, but still not to Submitted without a file", async () => {
      const id = await makeCreative(admin);
      expect((await admin.client.from("creatives").update({ status: "submitted" }).eq("id", id)).error).not.toBeNull();
      for (const status of ["approved", "sent_to_ads", "changes_requested", "requested"]) {
        expect((await admin.client.from("creatives").update({ status }).eq("id", id)).error, status).toBeNull();
      }
    });
  });

  describe("activity log", () => {
    it("records changes, is readable, and is immutable for every client role", async () => {
      const id = await makeCreative(admin);
      await admin.client.from("creatives").update({ title: "[rls-test] logged", due_date: "2033-03-03" }).eq("id", id);
      const { data: log } = await creative.client.from("activity_log").select("action, meta").eq("creative_id", id);
      const actions = (log ?? []).map((l) => l.action);
      expect(actions).toContain("created");
      expect(actions.filter((a) => a === "field_changed").length).toBeGreaterThanOrEqual(2);
      for (const u of [admin, creative, ads]) {
        expect((await u.client.from("activity_log").insert({ creative_id: id, action: "forged" })).error).not.toBeNull();
        expect(denied(await u.client.from("activity_log").update({ action: "x" }).eq("creative_id", id).select())).toBe(true);
        expect(denied(await u.client.from("activity_log").delete().eq("creative_id", id).select())).toBe(true);
      }
      // even the service role cannot rewrite history
      expect((await service().from("activity_log").update({ action: "x" }).eq("creative_id", id)).error).not.toBeNull();
    });

    it("hides the log of deleted creatives from non-admins", async () => {
      const id = await makeCreative(admin);
      await admin.client.from("creatives").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      expect(denied(await creative.client.from("activity_log").select("id").eq("creative_id", id))).toBe(true);
      expect(denied(await admin.client.from("activity_log").select("id").eq("creative_id", id))).toBe(false);
    });
  });
});
