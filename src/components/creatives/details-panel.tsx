"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  setDeleted,
  setStatus,
  updateAdminFields,
  updateAdsFields,
  updateCreativeFields,
  updateTrackerFields,
  type Result,
} from "@/actions/creatives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "./badges";
import { GoLiveDialog } from "./go-live-dialog";
import { canEditLiveState } from "@/lib/workflow";
import {
  allowedNextStatuses,
  canEditAdsFields,
  canEditBrief,
  canEditCreativeFields,
  canSoftDelete,
} from "@/lib/permissions";
import { formatDateOnly, formatIST, fromISTInput, toISTInput } from "@/lib/time";
import { LIVE_LABEL, STATUS_LABEL, type Creative, type LiveState, type Role, type Status } from "@/lib/types";
import { formatInTimeZone } from "date-fns-tz";
import { ASSET_TYPE_LABEL, LANDING_PAGE_TYPES, yesNoLabel } from "@/lib/tracker";

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, ok = "Saved") =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  return { pending, run };
}

function Section({ title, children, hint, defaultOpenOnPhone = false }: { title: string; hint?: string; defaultOpenOnPhone?: boolean; children: React.ReactNode }) {
  // Always open on desktop (CSS); on phones sections start collapsed except where noted.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!defaultOpenOnPhone && !window.matchMedia("(min-width: 1024px)").matches) setOpen(false);
  }, [defaultOpenOnPhone]);
  return (
    <section className="rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-4 py-3 text-left lg:pointer-events-none lg:min-h-0 lg:pb-0"
      >
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform lg:hidden", open && "rotate-180")} aria-hidden />
      </button>
      <div className={cn("space-y-3 px-4 pb-4 pt-3", !open && "hidden lg:block")}>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words text-sm">{children}</div>
    </div>
  );
}

function LinkOrDash({ href }: { href: string | null }) {
  if (!href) return <>—</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
      Open <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

export function DetailsPanel({ creative: c, role }: { creative: Creative; role: Role }) {
  return (
    <aside className="space-y-4" aria-label="Details">
      <StatusSection c={c} role={role} />
      <CreativeSection c={c} role={role} />
      <DatesSection c={c} role={role} />
      <AdsSection c={c} role={role} />
      <TrackerSection c={c} role={role} />
      {canSoftDelete(role) && <DeleteSection c={c} />}
    </aside>
  );
}

function StatusSection({ c, role }: { c: Creative; role: Role }) {
  const options = allowedNextStatuses(role, c.status, !!c.current_version_id);
  const [next, setNext] = useState<Status | "">("");
  const [liveOpen, setLiveOpen] = useState(false);
  const router = useRouter();
  const { pending, run } = useSave();
  return (
    <Section title="Status" defaultOpenOnPhone>
      <GoLiveDialog
        open={liveOpen}
        onOpenChange={setLiveOpen}
        creativeId={c.id}
        title={c.title}
        defaultLink={c.meta_preview_link}
        onResult={(ok) => {
          if (ok) {
            setNext("");
            router.refresh();
          }
        }}
      />
      <StatusBadge status={c.status} />
      {options.length > 0 && !c.deleted_at ? (
        <div className="flex gap-2">
          <select aria-label="Move to status" className={selectCls} value={next} onChange={(e) => setNext(e.target.value as Status)}>
            <option value="">Move to…</option>
            {options.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <Button
            disabled={!next || pending}
            onClick={() => (next === "live" ? setLiveOpen(true) : run(() => setStatus(c.id, next as Status), "Status updated"))}
          >
            Update
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No status changes available for your role right now.</p>
      )}
    </Section>
  );
}

function CreativeSection({ c, role }: { c: Creative; role: Role }) {
  const editable = canEditCreativeFields(role);
  const { pending, run } = useSave();
  if (!editable) {
    return (
      <Section title="Creative details">
        <Field label="Campaign / product">{c.campaign ?? "—"}</Field>
        <Field label="Format"><span className="capitalize">{c.format}</span></Field>
        <Field label="Drive link (original)"><LinkOrDash href={c.drive_link} /></Field>
        <Field label="Notes / copy"><span className="whitespace-pre-wrap">{c.copy_notes ?? "—"}</span></Field>
      </Section>
    );
  }
  return (
    <Section title="Creative details">
      <form
        key={c.updated_at}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() =>
            updateCreativeFields(c.id, {
              title: String(f.get("title")),
              campaign: String(f.get("campaign") ?? ""),
              format: f.get("format") as Creative["format"],
              drive_link: String(f.get("drive_link") ?? ""),
              copy_notes: String(f.get("copy_notes") ?? ""),
            }),
          );
        }}
      >
        <div className="space-y-1.5"><Label htmlFor="d-title">Title</Label><Input id="d-title" name="title" defaultValue={c.title} required /></div>
        <div className="space-y-1.5"><Label htmlFor="d-campaign">Campaign / product</Label><Input id="d-campaign" name="campaign" defaultValue={c.campaign ?? ""} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="d-format">Format</Label>
          <select id="d-format" name="format" className={selectCls} defaultValue={c.format}>
            <option value="image">Image</option><option value="video">Video</option><option value="carousel">Carousel</option>
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="d-drive">Drive link (original)</Label><Input id="d-drive" name="drive_link" type="url" inputMode="url" defaultValue={c.drive_link ?? ""} placeholder="https://drive.google.com/…" /></div>
        <div className="space-y-1.5"><Label htmlFor="d-copy">Notes / copy / caption</Label><Textarea id="d-copy" name="copy_notes" rows={4} defaultValue={c.copy_notes ?? ""} /></div>
        <Button type="submit" disabled={pending} className="w-full" size="lg">{pending ? "Saving…" : "Save details"}</Button>
      </form>
    </Section>
  );
}

function DatesSection({ c, role }: { c: Creative; role: Role }) {
  const { pending, run } = useSave();
  if (!canEditBrief(role)) {
    return (
      <Section title="Brief & dates">
        <Field label="Date to be submitted">{formatDateOnly(c.due_date)}</Field>
        <Field label="Actual submission">{formatIST(c.submitted_at)}</Field>
        <Field label="Brief"><span className="whitespace-pre-wrap">{c.brief ?? "—"}</span></Field>
        {c.reference_links.length > 0 && (
          <Field label="Reference links">
            <ul className="space-y-1">
              {c.reference_links.map((l) => (
                <li key={l}><a className="underline underline-offset-2" href={l} target="_blank" rel="noopener noreferrer">{l}</a></li>
              ))}
            </ul>
          </Field>
        )}
      </Section>
    );
  }
  return (
    <Section title="Brief & dates" hint="Admin only. Times are in IST.">
      <form
        key={c.updated_at}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const due = String(f.get("due_date") ?? "");
          const brief = String(f.get("brief") ?? "").trim();
          run(() =>
            updateAdminFields(c.id, {
              due_date: due || null,
              brief: brief || null,
              submitted_at: fromISTInput(String(f.get("submitted_at") ?? "")),
              reference_links: String(f.get("links") ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
            }),
          );
        }}
      >
        <div className="space-y-1.5"><Label htmlFor="a-due">Date to be submitted</Label><Input id="a-due" name="due_date" type="date" defaultValue={c.due_date ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="a-sub">Actual submission (auto-set on first upload)</Label><Input id="a-sub" name="submitted_at" type="datetime-local" defaultValue={toISTInput(c.submitted_at)} /></div>
        <div className="space-y-1.5"><Label htmlFor="a-brief">Brief</Label><Textarea id="a-brief" name="brief" rows={4} defaultValue={c.brief ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="a-links">Reference links (one per line)</Label><Textarea id="a-links" name="links" rows={2} defaultValue={c.reference_links.join("\n")} /></div>
        <Button type="submit" disabled={pending} className="w-full" size="lg">{pending ? "Saving…" : "Save brief & dates"}</Button>
      </form>
    </Section>
  );
}

function AdsSection({ c, role }: { c: Creative; role: Role }) {
  const { pending, run } = useSave();
  const [state, setState] = useState<LiveState>(c.live_state);
  const [wentLive, setWentLive] = useState(toISTInput(c.went_live_at));

  if (!canEditAdsFields(role) || !canEditLiveState(role, c.status)) {
    return (
      <Section
        title="Live status (Decision Pinnacle)"
        hint={canEditAdsFields(role) ? "Available once the creative has been sent to ads." : undefined}
      >
        <Field label="Live state">{LIVE_LABEL[c.live_state]}</Field>
        <Field label="Went live at">{formatIST(c.went_live_at)}</Field>
        <Field label="Meta Ads preview"><LinkOrDash href={c.meta_preview_link} /></Field>
        <Field label="Ads notes"><span className="whitespace-pre-wrap">{c.ads_notes ?? "—"}</span></Field>
      </Section>
    );
  }
  return (
    <Section title="Live status (Decision Pinnacle)" hint="Went-live time auto-fills when set to Live; edit if needed.">
      <form
        key={c.updated_at}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() =>
            updateAdsFields(c.id, {
              live_state: state,
              went_live_at: fromISTInput(wentLive),
              meta_preview_link: String(f.get("meta") ?? ""),
              ads_notes: String(f.get("notes") ?? ""),
            }),
          );
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="l-state">Is it live?</Label>
          <select
            id="l-state"
            className={selectCls}
            value={state}
            onChange={(e) => {
              const v = e.target.value as LiveState;
              setState(v);
              if (v === "live" && !wentLive) setWentLive(formatInTimeZone(new Date(), "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm"));
            }}
          >
            {(Object.keys(LIVE_LABEL) as LiveState[]).map((s) => (
              <option key={s} value={s}>{LIVE_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="l-when">Went live at (IST)</Label><Input id="l-when" type="datetime-local" value={wentLive} onChange={(e) => setWentLive(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="l-meta">Meta Ads preview link</Label><Input id="l-meta" name="meta" type="url" inputMode="url" defaultValue={c.meta_preview_link ?? ""} placeholder="https://fb.me/…" /></div>
        <div className="space-y-1.5"><Label htmlFor="l-notes">DP notes</Label><Textarea id="l-notes" name="notes" rows={3} defaultValue={c.ads_notes ?? ""} /></div>
        <Button type="submit" disabled={pending} className="w-full" size="lg">{pending ? "Saving…" : "Save live status"}</Button>
      </form>
    </Section>
  );
}

const triValue = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");

function TrackerSection({ c, role }: { c: Creative; role: Role }) {
  const { pending, run } = useSave();
  const triOptions = (
    <>
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </>
  );

  if (!canEditAdsFields(role)) {
    return (
      <Section title="Ads tracker details" hint="Shown in the Ads Tracker tab.">
        <Field label="Product advertised">{c.product_advertised ?? "—"}</Field>
        <Field label="Ad name">{c.ad_name ?? "—"}</Field>
        <Field label="Meta campaign / ad set">{[c.meta_campaign_name, c.ad_set_name].filter(Boolean).join(" · ") || "—"}</Field>
        <Field label="Landing page"><LinkOrDash href={c.landing_page_url} /></Field>
        <Field label="Partnership ad">{yesNoLabel(c.partnership_ad) || "—"}</Field>
      </Section>
    );
  }

  const text = (id: string, name: string, label: string, value: string | null, extra?: string) => (
    <div className={cn("space-y-1.5", extra)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} defaultValue={value ?? ""} />
    </div>
  );
  const tri = (id: string, name: string, label: string, value: boolean | null) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} className={selectCls} defaultValue={triValue(value)}>{triOptions}</select>
    </div>
  );

  return (
    <Section title="Ads tracker details" hint="Feeds the Ads Tracker tab (product, ad names, hooks, landing page).">
      <form
        key={c.updated_at}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const g = (k: string) => String(f.get(k) ?? "") as never;
          run(
            () =>
              updateTrackerFields(c.id, {
                product_advertised: g("product_advertised"),
                asset_type: g("asset_type"),
                creator_name: g("creator_name"),
                instagram_handle: g("instagram_handle"),
                ad_name: g("ad_name"),
                meta_campaign_name: g("meta_campaign_name"),
                ad_set_name: g("ad_set_name"),
                partnership_ad: g("partnership_ad"),
                language: g("language"),
                face_in_first_3s: g("face_in_first_3s"),
                audio_hook_first_3s: g("audio_hook_first_3s"),
                text_in_first_3s: g("text_in_first_3s"),
                caption: g("caption"),
                landing_page_url: g("landing_page_url"),
                landing_page_type: g("landing_page_type"),
                cta_used: g("cta_used"),
                pause_reason: g("pause_reason"),
                tracker_comments: g("tracker_comments"),
              }),
            "Tracker details saved",
          );
        }}
      >
        {text("t-product", "product_advertised", "Product advertised", c.product_advertised)}
        <div className="space-y-1.5">
          <Label htmlFor="t-asset">Asset type</Label>
          <select id="t-asset" name="asset_type" className={selectCls} defaultValue={c.asset_type ?? ""}>
            <option value="">—</option>
            {(Object.keys(ASSET_TYPE_LABEL) as (keyof typeof ASSET_TYPE_LABEL)[]).map((k) => (
              <option key={k} value={k}>{ASSET_TYPE_LABEL[k]}</option>
            ))}
          </select>
        </div>
        {text("t-creator", "creator_name", "Creator name", c.creator_name)}
        {text("t-ig", "instagram_handle", "Instagram handle", c.instagram_handle)}
        {text("t-ad", "ad_name", "Ad name (Meta)", c.ad_name)}
        {text("t-camp", "meta_campaign_name", "Campaign name (Meta)", c.meta_campaign_name)}
        {text("t-adset", "ad_set_name", "Ad set name (Meta)", c.ad_set_name)}
        <div className="grid grid-cols-2 gap-3">
          {tri("t-partner", "partnership_ad", "Partnership ad", c.partnership_ad)}
          {text("t-lang", "language", "Language", c.language)}
          {tri("t-face", "face_in_first_3s", "Face in first 3s", c.face_in_first_3s)}
          {tri("t-audio", "audio_hook_first_3s", "Audio hook in 3s", c.audio_hook_first_3s)}
          {tri("t-texthook", "text_in_first_3s", "Text in first 3s", c.text_in_first_3s)}
          {text("t-cta", "cta_used", "CTA used", c.cta_used)}
        </div>
        <div className="space-y-1.5"><Label htmlFor="t-lp">Landing page URL</Label><Input id="t-lp" name="landing_page_url" type="url" inputMode="url" defaultValue={c.landing_page_url ?? ""} placeholder="https://…" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="t-lptype">Landing page type</Label>
          <select id="t-lptype" name="landing_page_type" className={selectCls} defaultValue={c.landing_page_type ?? ""}>
            <option value="">—</option>
            {LANDING_PAGE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="t-caption">Caption</Label><Textarea id="t-caption" name="caption" rows={4} defaultValue={c.caption ?? ""} /></div>
        {text("t-reason", "pause_reason", "Reason if paused", c.pause_reason)}
        <div className="space-y-1.5"><Label htmlFor="t-comments">Tracker comments</Label><Textarea id="t-comments" name="tracker_comments" rows={3} defaultValue={c.tracker_comments ?? ""} /></div>
        <Button type="submit" disabled={pending} className="w-full" size="lg">{pending ? "Saving…" : "Save tracker details"}</Button>
      </form>
    </Section>
  );
}

function DeleteSection({ c }: { c: Creative }) {
  const { pending, run } = useSave();
  const deleted = !!c.deleted_at;
  return (
    <Section title="Admin">
      <Button
        variant={deleted ? "outline" : "destructive"}
        className="w-full"
        disabled={pending}
        onClick={() => {
          if (!deleted && !confirm("Delete this creative? You can restore it later from the Deleted filter.")) return;
          run(() => setDeleted(c.id, !deleted), deleted ? "Restored" : "Deleted");
        }}
      >
        {deleted ? "Restore creative" : "Delete creative"}
      </Button>
    </Section>
  );
}
