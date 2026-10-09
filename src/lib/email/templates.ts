import { describeNotification, notificationHref, type NotificationRow } from "@/lib/notifications";

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(heading: string, bodyHtml: string, cta: { href: string; label: string } | null, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:12px;padding:24px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;color:#666;padding-bottom:8px">Creative Hub</td></tr>
<tr><td style="font-size:18px;font-weight:600;padding-bottom:12px">${escapeHtml(heading)}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;padding-bottom:20px">${bodyHtml}</td></tr>
${cta ? `<tr><td><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">${escapeHtml(cta.label)}</a></td></tr>` : ""}
<tr><td style="font-size:12px;color:#888;padding-top:24px">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

const prefsFooter = () =>
  `You get this because of your notification settings. <a href="${siteUrl()}/settings/notifications" style="color:#888">Change them</a>.`;

export function renderNotificationEmail(
  n: Pick<NotificationRow, "type" | "creative_id" | "comment_id" | "message_id" | "payload">,
  actorName: string | null,
) {
  const text = describeNotification(n, actorName);
  const href = siteUrl() + notificationHref(n);
  const snippet = typeof n.payload.snippet === "string" ? n.payload.snippet : "";
  const quote = snippet
    ? `<blockquote style="margin:12px 0 0;padding:8px 12px;border-left:3px solid #ddd;color:#444">${escapeHtml(snippet)}</blockquote>`
    : "";
  return {
    subject: text.length > 90 ? text.slice(0, 87) + "…" : text,
    html: layout(text, quote || "&nbsp;", { href, label: "Open in Creative Hub" }, prefsFooter()),
    text: `${text}\n${snippet ? `\n"${snippet}"\n` : ""}\nOpen: ${href}\n\nChange email settings: ${siteUrl()}/settings/notifications`,
  };
}

export function renderDigestEmail(opts: {
  name: string;
  items: { text: string; href: string }[];
  waiting: number;
}) {
  const heading = `Your daily summary`;
  const list = opts.items
    .map((i) => `<li style="margin-bottom:6px"><a href="${escapeHtml(siteUrl() + i.href)}" style="color:#111">${escapeHtml(i.text)}</a></li>`)
    .join("");
  const body = `<p style="margin:0 0 12px">Hi ${escapeHtml(opts.name)},</p>
${opts.waiting ? `<p style="margin:0 0 12px"><b>${opts.waiting}</b> creative${opts.waiting === 1 ? " is" : "s are"} waiting on you.</p>` : ""}
${opts.items.length ? `<p style="margin:0 0 6px">Unread in the last 24 hours:</p><ul style="padding-left:18px;margin:0">${list}</ul>` : ""}`;
  return {
    subject: `Creative Hub: ${opts.waiting ? `${opts.waiting} waiting on you` : "daily summary"}`,
    html: layout(heading, body, { href: siteUrl() + "/dashboard", label: "Open dashboard" }, prefsFooter()),
    text:
      `Hi ${opts.name},\n${opts.waiting ? `${opts.waiting} creative(s) waiting on you.\n` : ""}\n` +
      opts.items.map((i) => `- ${i.text}: ${siteUrl()}${i.href}`).join("\n") +
      `\n\nDashboard: ${siteUrl()}/dashboard`,
  };
}
