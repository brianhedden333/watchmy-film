// Outgoing email through SendGrid's HTTP API. Without an API key (local dev), messages are printed to the log.

import { config } from "./config.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function sendEmail({ to, subject, text, html, replyTo }) {
  if (!to) return;
  if (!config.sendgridKey) {
    console.log(`\n--- email (not sent: no SENDGRID_API_KEY) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---\n`);
    return;
  }
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.sendgridKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.fromEmail, name: config.fromName },
      ...(replyTo ? { reply_to: { email: replyTo } } : {}),
      subject,
      content: [
        { type: "text/plain", value: text },
        ...(html ? [{ type: "text/html", value: html }] : []),
      ],
      tracking_settings: { click_tracking: { enable: false, enable_text: false } },
    }),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
}

// Notices to us. Never let a failed notice break the request that triggered it.
export function notifyAdmin(subject, text) {
  sendEmail({ to: config.notifyEmail, subject: `[${config.siteName}] ${subject}`, text }).catch((e) =>
    console.error("Admin notice failed:", e.message)
  );
}

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0b;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#d9d9d9">
<div style="max-width:520px;margin:0 auto;background:#141414;border-top:3px solid #ffe7a3;border-radius:8px;padding:32px">
<p style="margin:0 0 24px;font-weight:700;color:#ffe7a3;letter-spacing:.02em">${esc(config.siteName)}</p>
<h1 style="margin:0 0 16px;font-size:22px;color:#fff">${esc(title)}</h1>
${bodyHtml}
</div></body></html>`;
}

const button = (href, label) =>
  `<p style="margin:28px 0"><a href="${esc(href)}" style="background:#4a1424;color:#fff;text-decoration:none;padding:14px 24px;border-radius:6px;border:1px solid #ffe7a3;display:inline-block;font-weight:700">${esc(label)}</a></p>`;

const para = (s) => `<p style="margin:0 0 14px;line-height:1.55">${esc(s)}</p>`;

export function signInEmail(to, link, isNew) {
  const title = isNew ? "Confirm your email" : "Your sign-in link";
  const lead = isNew
    ? "Click the button to confirm this is your email and finish creating your account. The link works once and expires in 30 minutes."
    : "Click the button to sign in. The link works once and expires in 30 minutes.";
  return sendEmail({
    to,
    subject: isNew ? `Confirm your ${config.siteName} account` : `Sign in to ${config.siteName}`,
    text: `${title}\n\n${lead}\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: layout(
      title,
      para(lead) +
        button(link, isNew ? "Confirm my email" : "Sign in") +
        `<p style="margin:0;font-size:13px;color:#8a8a8a;line-height:1.5">If you didn't ask for this, you can ignore this email.</p>`
    ),
  });
}

export function filmSubmittedEmail(to, film, how) {
  const dash = `${config.appUrl}/add-a-film/?film=${film.id}`;
  const line = how === "paid" ? `We received your $${(config.setupFeeCents / 100).toFixed(0)} setup fee.` : "Your setup fee was waived.";
  return sendEmail({
    to,
    subject: `${film.title} is in review`,
    text: `${line} ${film.title} is now in review. We'll email you when it's approved, then help you connect Stripe and go live.\n\n${dash}`,
    html: layout(
      `${film.title} is in review`,
      para(line) +
        para("We'll email you when it's approved, then help you connect Stripe and go live.") +
        button(dash, "Open your film")
    ),
  });
}

export function filmStatusEmail(to, film) {
  const dash = `${config.appUrl}/add-a-film/?film=${film.id}`;
  const msgs = {
    approved: [`${film.title} is approved`, "Your film passed review. Next we'll help you connect Stripe and set up your address."],
    live: [`${film.title} is live`, "Your watch page is live and ready to share."],
    changes_requested: [`${film.title} needs a few changes`, "We reviewed your film and need a few changes before it can go live."],
  };
  const m = msgs[film.status];
  if (!m) return Promise.resolve();
  const note = film.admin_note ? `\n\nNote from us: ${film.admin_note}` : "";
  return sendEmail({
    to,
    subject: m[0],
    text: `${m[1]}${note}\n\n${dash}`,
    html: layout(m[0], para(m[1]) + (film.admin_note ? para(`Note from us: ${film.admin_note}`) : "") + button(dash, "Open your film")),
  });
}
