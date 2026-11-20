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

// Logo for emails: always the public site's copy, so it loads in inboxes even when links point at a dev server.
const LOGO = "https://watchmyfilm.online/brand/watchmyfilm-logo-white.png";

// The site's screening-room palette: black, warm house gray, projector cream.
function layout(title, bodyHtml) {
  return `<!doctype html><html><head><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;background:#000000;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#ede8df">
<div style="max-width:520px;margin:0 auto">
<p style="margin:0 0 20px"><img src="${LOGO}" alt="${esc(config.siteName)}" width="150" height="41" style="display:block;border:0;width:150px;height:auto"></p>
<div style="background:#1f1d1b;border:1px solid #3a3734;border-top:2px solid #ede8df;border-radius:8px;padding:32px">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#ede8df">${esc(title)}</h1>
${bodyHtml}
</div>
<p style="margin:20px 4px 0;font-size:12px;line-height:1.5;color:#a39e95">${esc(config.siteName)} · Independent films, sold direct by their filmmakers.</p>
</div></body></html>`;
}

const button = (href, label) =>
  `<p style="margin:28px 0"><a href="${esc(href)}" style="background:#ede8df;color:#000000;text-decoration:none;padding:14px 26px;border-radius:4px;display:inline-block;font-weight:700;font-size:16px">${esc(label)}</a></p>`;

const para = (s) => `<p style="margin:0 0 14px;line-height:1.55;color:#ede8df">${esc(s)}</p>`;

export function signInEmail(to, link, isNew) {
  const title = isNew ? "Confirm your email" : "Your sign-in link";
  const lead = isNew
    ? "Click the button to confirm this is your email and finish creating your account. The link works once and expires in 24 hours."
    : "Click the button to sign in. The link works once and expires in 30 minutes.";
  return sendEmail({
    to,
    subject: isNew ? `Confirm your ${config.siteName} account` : `Sign in to ${config.siteName}`,
    text: `${title}\n\n${lead}\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: layout(
      title,
      para(lead) +
        button(link, isNew ? "Confirm my email" : "Sign in") +
        `<p style="margin:0;font-size:13px;color:#a39e95;line-height:1.5">If you didn't ask for this, you can ignore this email.</p>`
    ),
  });
}

export function filmSubmittedEmail(to, film, how) {
  const dash = `${config.appUrl}/add-a-film/?film=${film.id}`;
  const fee = `$${(config.setupFeeCents / 100).toFixed(0)}`;
  const line =
    how === "paid"
      ? `We received your ${fee} setup fee.`
      : how === "deferred"
        ? `There's nothing to pay now. Once you're selling, we add $${(config.setupSurchargeCents / 100).toFixed(0)} to our fee on each sale until the ${fee} setup cost is covered.`
        : "Your setup fee was waived.";
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

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const small = (s) => `<p style="margin:0;font-size:13px;color:#a39e95;line-height:1.5">${esc(s)}</p>`;

// To the viewer after paying. The link signs them in on the film's own address (works once, for 7 days).
export function purchaseEmail(to, { title, access, link, days, hours }) {
  const what =
    access === "buy"
      ? `You own ${title}. Watch it any time on its page.`
      : `You rented ${title}. Start watching within ${days} days; once you press play you have ${hours} hours to finish.`;
  return sendEmail({
    to,
    subject: `Your film: ${title}`,
    text: `${what}\n\nWatch now (this link signs you in on this device):\n${link}\n\nOn another device? Open the film's page and choose "Already paid? Watch now" with this email address.`,
    html: layout(
      `Thanks for watching ${title}`,
      para(what) +
        button(link, "Watch now") +
        small(`This button signs you in on this device. On another device, open the film's page and choose "Already paid? Watch now" with this email address.`)
    ),
  });
}

// To a returning viewer who asked for a link on the film's page.
export function viewerSignInEmail(to, { title, link }) {
  return sendEmail({
    to,
    subject: `Watch ${title}`,
    text: `Here's your link to watch ${title}. It works once and expires in 30 minutes.\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: layout(
      `Watch ${title}`,
      para("Click the button to sign in and watch. The link works once and expires in 30 minutes.") +
        button(link, "Watch now") +
        small("If you didn't ask for this, you can ignore this email.")
    ),
  });
}

// To the filmmaker for each sale.
export function saleEmail(to, { title, kind, amountCents, feeCents, dashboard }) {
  const label = kind === "buy" ? "purchase" : kind === "pwyw" ? "pay-what-you-want sale" : "rental";
  const line = `New ${label} of ${title}: ${money(amountCents)}. Our fee: ${money(feeCents)}. Stripe's card fee comes out in your Stripe account.`;
  return sendEmail({
    to,
    subject: `New ${label}: ${title} (${money(amountCents)})`,
    text: `${line}\n\nSee it in your Stripe Dashboard:\n${dashboard}`,
    html: layout(`New ${label}`, para(line) + button(dashboard, "Open your Stripe Dashboard")),
  });
}
