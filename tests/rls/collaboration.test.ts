import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, dbEnabled, denied, makeCreative, makeUser, service, uploadVersion, type TestUser } from "./helpers";

/** Comments, notifications, channels, storage and anonymous access, per role, against the real database. */
describe.skipIf(!dbEnabled)("RLS: comments, notifications, channels, storage, anonymous", () => {
  let admin: TestUser, creative: TestUser, ads: TestUser;
  let creativeId: string;

  beforeAll(async () => {
    [admin, creative, ads] = await Promise.all([makeUser("admin"), makeUser("creative"), makeUser("ads")]);
    creativeId = await makeCreative(admin);
    await uploadVersion(creative, creativeId);
  });

  describe("comments", () => {
    it("every role can comment as themselves, but not as someone else", async () => {
      for (const u of [admin, creative, ads]) {
        expect((await u.client.from("comments").insert({ creative_id: creativeId, author_id: u.id, body: `hello from ${u.role}` })).error).toBeNull();
      }
      expect((await creative.client.from("comments").insert({ creative_id: creativeId, author_id: admin.id, body: "spoof" })).error).not.toBeNull();
    });

    it("comments are immutable except pinned; nobody can delete them", async () => {
      const { data } = await creative.client.from("comments").insert({ creative_id: creativeId, author_id: creative.id, body: "original" }).select("id").single();
      const id = data!.id as string;
      expect((await creative.client.from("comments").update({ body: "edited" }).eq("id", id)).error).not.toBeNull();
      expect((await ads.client.from("comments").update({ pinned: true }).eq("id", id)).error).toBeNull();
      expect(denied(await admin.client.from("comments").delete().eq("id", id).select())).toBe(true);
    });

    it("a mention notifies only the mentioned user (and replaces the generic comment ping)", async () => {
      const { data } = await admin.client.from("comments").insert({ creative_id: creativeId, author_id: admin.id, body: "@ads please check" }).select("id").single();
      await admin.client.from("mentions").insert({ comment_id: data!.id, user_id: ads.id });
      const { data: adsN } = await ads.client.from("notifications").select("type").eq("comment_id", data!.id);
      expect(adsN?.map((n) => n.type)).toEqual(["mention"]);
      const { data: adminN } = await admin.client.from("notifications").select("id").eq("comment_id", data!.id);
      expect(adminN ?? []).toHaveLength(0); // the actor is never notified
    });
  });

  describe("notifications", () => {
    it("users see only their own, cannot forge or delete, and can only change read_at", async () => {
      const { data: mine } = await ads.client.from("notifications").select("id, user_id");
      expect((mine ?? []).length).toBeGreaterThan(0);
      expect((mine ?? []).every((n) => n.user_id === ads.id)).toBe(true);

      expect((await ads.client.from("notifications").insert({ user_id: ads.id, type: "mention" })).error).not.toBeNull();
      expect(denied(await ads.client.from("notifications").delete().eq("user_id", ads.id).select())).toBe(true);

      const target = mine![0].id as string;
      expect((await ads.client.from("notifications").update({ type: "comment" }).eq("id", target)).error).not.toBeNull();
      expect((await ads.client.from("notifications").update({ email_status: "sent" }).eq("id", target)).error).not.toBeNull();
      expect((await ads.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", target)).error).toBeNull();
      // someone else's notification cannot be read or changed
      expect(denied(await creative.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", target).select())).toBe(true);
    });

    it("the upload notified admin and ads, not the uploader; requests notified the creative team", async () => {
      const { data: a } = await admin.client.from("notifications").select("type").eq("creative_id", creativeId).eq("type", "version_uploaded");
      const { data: d } = await ads.client.from("notifications").select("type").eq("creative_id", creativeId).eq("type", "version_uploaded");
      const { data: c } = await creative.client.from("notifications").select("type").eq("creative_id", creativeId).eq("type", "version_uploaded");
      expect(a).toHaveLength(1);
      expect(d).toHaveLength(1);
      expect(c ?? []).toHaveLength(0);
      const { data: req } = await creative.client.from("notifications").select("type").eq("creative_id", creativeId).eq("type", "request_created");
      expect(req).toHaveLength(1);
    });

    it("internal functions are not callable by clients", async () => {
      expect((await ads.client.rpc("generate_due_reminders")).error).not.toBeNull();
      expect((await ads.client.rpc("notify", { p_users: [ads.id], p_type: "mention" })).error).not.toBeNull();
      expect((await ads.client.rpc("log_activity", { p_creative: creativeId, p_action: "forged" })).error).not.toBeNull();
      expect(denied(await ads.client.from("rate_limits").select("*"))).toBe(true);
      expect(denied(await ads.client.from("due_reminders").select("*"))).toBe(true);
      expect(denied(await ads.client.from("digest_log").select("*"))).toBe(true);
    });
  });

  describe("General channel", () => {
    it("everyone can read and post; author cannot be spoofed; only admin can pin; no nested replies", async () => {
      const { data: ch } = await creative.client.from("channels").select("id").eq("slug", "general").single();
      const channel_id = ch!.id as string;
      const { data: m } = await creative.client.from("messages").insert({ channel_id, author_id: creative.id, body: "hi all" }).select("id").single();
      expect((await ads.client.from("messages").select("id").eq("id", m!.id)).data).toHaveLength(1);
      expect((await ads.client.from("messages").insert({ channel_id, author_id: creative.id, body: "spoof" })).error).not.toBeNull();

      await creative.client.from("messages").update({ pinned: true }).eq("id", m!.id);
      expect((await admin.client.from("messages").select("pinned").eq("id", m!.id).single()).data?.pinned).toBe(false);
      expect((await admin.client.from("messages").update({ pinned: true }).eq("id", m!.id)).error).toBeNull();
      expect((await admin.client.from("messages").select("pinned").eq("id", m!.id).single()).data?.pinned).toBe(true);
      expect((await creative.client.from("messages").update({ body: "edited" }).eq("id", m!.id)).error).not.toBeNull();

      const { data: reply } = await ads.client.from("messages").insert({ channel_id, author_id: ads.id, body: "reply", parent_id: m!.id }).select("id").single();
      expect((await creative.client.from("notifications").select("type").eq("message_id", reply!.id)).data?.map((n) => n.type)).toEqual(["reply"]);
      expect((await admin.client.from("messages").insert({ channel_id, author_id: admin.id, body: "nested", parent_id: reply!.id })).error).not.toBeNull();
      expect(denied(await admin.client.from("messages").delete().eq("id", m!.id).select())).toBe(true);
    });
  });

  describe("storage", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const upload = (u: TestUser, path: string) => u.client.storage.from("creatives").upload(path, png, { contentType: "image/png" });

    it("admin/creative upload creative files; ads only comment attachments; files are private and never deletable by clients", async () => {
      const own = `${creativeId}/${randomUUID()}.png`;
      expect((await upload(creative, own)).error).toBeNull();
      expect((await upload(admin, `${creativeId}/${randomUUID()}.png`)).error).toBeNull();
      expect((await upload(ads, `${creativeId}/${randomUUID()}.png`)).error).not.toBeNull();
      expect((await upload(ads, `comments/${creativeId}/${randomUUID()}.png`)).error).toBeNull();

      expect((await ads.client.storage.from("creatives").createSignedUrl(own, 60)).error).toBeNull();
      expect((await anonClient().storage.from("creatives").createSignedUrl(own, 60)).error).not.toBeNull();
      expect((await anonClient().storage.from("creatives").download(own)).error).not.toBeNull();

      for (const u of [admin, creative, ads]) {
        const res = await u.client.storage.from("creatives").remove([own]);
        expect(res.data ?? []).toHaveLength(0);
      }
      expect((await service().storage.from("creatives").list(creativeId)).data?.some((f) => own.endsWith(f.name))).toBe(true);
    });
  });

  describe("anonymous (not signed in)", () => {
    it("sees nothing and can write nothing", async () => {
      const anon = anonClient();
      for (const table of ["creatives", "creative_versions", "comments", "notifications", "activity_log", "messages", "channels", "profiles", "push_subscriptions"]) {
        expect(denied(await anon.from(table).select("*").limit(1)), table).toBe(true);
      }
      expect((await anon.from("creatives").insert({ title: "x" })).error).not.toBeNull();
      expect((await anon.rpc("add_creative_version", { p_creative: creativeId, p_file_path: "x", p_thumb_path: null, p_mime: "image/png", p_size: 1 })).error).not.toBeNull();
    });
  });
});
