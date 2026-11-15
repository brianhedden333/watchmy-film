// Promo codes. Platform codes (film_id NULL) are ours, e.g. setup fee waivers for friends and early customers.
// Film codes (film_id set) will be filmmakers' own viewer discounts; this file is where their rules go too.

import { db, now } from "./db.js";

export const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;
export const normalizeCode = (s) => String(s || "").trim().toUpperCase();

// Why a code can't be used right now, or null if it can.
export function codeProblem(code) {
  if (!code || !code.active) return "That code isn't valid.";
  if (code.expires_at && code.expires_at < now()) return "That code has expired.";
  if (code.max_uses != null && code.uses >= code.max_uses) return "That code has already been used.";
  return null;
}

export function findPlatformCode(text) {
  return db.prepare("SELECT * FROM promo_codes WHERE film_id IS NULL AND code = ? COLLATE NOCASE").get(normalizeCode(text));
}

// Uses up one redemption of a setup waiver and marks the film's setup fee waived. Returns an error message or null.
export function redeemSetupWaiver(text, film, user) {
  const code = findPlatformCode(text);
  if (code && code.kind !== "setup_waiver") return "That code can't be used for the setup fee.";
  const problem = codeProblem(code);
  if (problem) return problem;

  return db.transaction(() => {
    // The uses check is repeated in the UPDATE so two people can't both take the last use.
    const took = db
      .prepare("UPDATE promo_codes SET uses = uses + 1 WHERE id = ? AND (max_uses IS NULL OR uses < max_uses)")
      .run(code.id);
    if (took.changes !== 1) return "That code has already been used.";
    db.prepare("INSERT INTO promo_redemptions (promo_code_id, film_id, user_id) VALUES (?, ?, ?)").run(
      code.id,
      film.id,
      user.id
    );
    db.prepare(
      `UPDATE films SET setup_status = 'waived', setup_paid_at = ?, status = 'in_review', submitted_at = ?,
       pending_checkout_id = NULL, updated_at = ? WHERE id = ?`
    ).run(now(), now(), now(), film.id);
    return null;
  })();
}

export function createCode({ code, filmId = null, kind, percentOff = null, amountOffCents = null, appliesTo, maxUses = null, expiresAt = null, note = null, createdBy }) {
  const info = db
    .prepare(
      `INSERT INTO promo_codes (code, film_id, kind, percent_off, amount_off_cents, applies_to, max_uses, expires_at, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(normalizeCode(code), filmId, kind, percentOff, amountOffCents, appliesTo, maxUses, expiresAt, note, createdBy);
  return db.prepare("SELECT * FROM promo_codes WHERE id = ?").get(info.lastInsertRowid);
}
