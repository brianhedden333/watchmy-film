// Admin: review films, manage waiver codes. Only ADMIN_EMAILS can reach these.

import { Router } from "express";
import { config } from "./config.js";
import { db, now } from "./db.js";
import { requireAdmin, requireUser } from "./auth.js";
import { CODE_RE, createCode, normalizeCode } from "./codes.js";
import { filmStatusEmail } from "./email.js";
import { createScreeningLink, publicFilm } from "./films.js";

const STATUSES = ["draft", "in_review", "changes_requested", "approved", "live"];

export const adminRouter = Router();
adminRouter.use(requireUser, requireAdmin);

adminRouter.get("/overview", (_req, res) => {
  const films = db
    .prepare(
      `SELECT f.*, u.email AS owner_email, u.name AS owner_name,
         u.stripe_has_account, u.stripe_email, u.stripe_account_id, u.stripe_country,
         (SELECT group_concat(c.code, ', ') FROM promo_redemptions r JOIN promo_codes c ON c.id = r.promo_code_id WHERE r.film_id = f.id) AS codes_used,
         (SELECT sum(amount_cents) FROM payments p WHERE p.film_id = f.id AND p.purpose = 'setup_fee') AS paid_cents,
         -- Viewer sales (purpose 'rent' or 'buy'), once watch page checkout records them.
         (SELECT ifnull(sum(amount_cents - refunded_cents), 0) FROM payments p WHERE p.film_id = f.id AND p.purpose IN ('rent', 'buy')) AS sales_cents,
         (SELECT count(*) FROM payments p WHERE p.film_id = f.id AND p.purpose IN ('rent', 'buy')) AS sales_count
       FROM films f JOIN users u ON u.id = f.user_id
       -- Deleted films (kept for the record) go last.
       ORDER BY (f.deleted_at IS NOT NULL), CASE f.status WHEN 'in_review' THEN 0 ELSE 1 END, f.updated_at DESC`
    )
    .all()
    .map(publicFilm);
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at, u.last_login_at, u.email_verified_at,
         u.password_hash IS NOT NULL AS has_password,
         u.stripe_has_account, u.stripe_email, u.stripe_account_id, u.stripe_country, (SELECT count(*) FROM films f WHERE f.user_id = u.id) AS films
       FROM users u ORDER BY u.created_at DESC`
    )
    .all();
  const codes = db
    .prepare(
      `SELECT c.*, (SELECT group_concat(f.title, ' | ') FROM promo_redemptions r LEFT JOIN films f ON f.id = r.film_id WHERE r.promo_code_id = c.id) AS used_by
       FROM promo_codes c WHERE c.film_id IS NULL ORDER BY c.created_at DESC`
    )
    .all();
  const revenue = db.prepare("SELECT coalesce(sum(amount_cents), 0) AS cents, count(*) AS n FROM payments WHERE purpose = 'setup_fee'").get();
  res.json({ films, users, codes, revenue, statuses: STATUSES, setupFeeCents: config.setupFeeCents });
});

adminRouter.patch("/films/:id", async (req, res) => {
  const film = db.prepare("SELECT f.*, u.email FROM films f JOIN users u ON u.id = f.user_id WHERE f.id = ?").get(Number(req.params.id));
  if (!film) return res.status(404).json({ error: "Film not found." });
  const status = req.body.status ?? film.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "Unknown status." });
  const note = "admin_note" in req.body ? String(req.body.admin_note || "").trim().slice(0, 3000) || null : film.admin_note;
  const staffPick = "staff_pick" in req.body ? (req.body.staff_pick ? 1 : 0) : film.staff_pick;
  db.prepare("UPDATE films SET status = ?, admin_note = ?, staff_pick = ?, updated_at = ? WHERE id = ?").run(status, note, staffPick, now(), film.id);

  let emailed = false;
  if (req.body.notify && status !== film.status) {
    try {
      await filmStatusEmail(film.email, { ...film, status, admin_note: note });
      emailed = true;
    } catch (e) {
      console.error("Status email failed:", e.message);
    }
  }
  res.json({ ok: true, emailed });
});

// A private test screening on indiefilm.club: the watch page with the film playing (any status, even without an
// address), so we can check the Vimeo embed works on the domain it's allowed on. The link works for 24 hours.
adminRouter.post("/films/:id/screening", (req, res) => {
  const film = db.prepare("SELECT id FROM films WHERE id = ? AND deleted_at IS NULL").get(Number(req.params.id));
  if (!film) return res.status(404).json({ error: "No such film." });
  res.json({ url: createScreeningLink(film.id, req.user.id) });
});

adminRouter.post("/codes", (req, res) => {
  const code = normalizeCode(req.body.code);
  if (!CODE_RE.test(code)) return res.status(400).json({ error: "Codes are 3 to 40 letters, numbers, dashes or underscores." });
  const maxUses = req.body.max_uses === "" || req.body.max_uses == null ? null : Number(req.body.max_uses);
  if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1)) return res.status(400).json({ error: "Max uses must be 1 or more, or blank for unlimited." });
  let expiresAt = null;
  if (req.body.expires_on) {
    const d = new Date(`${req.body.expires_on}T23:59:59`);
    if (isNaN(d)) return res.status(400).json({ error: "Expiry date isn't valid." });
    expiresAt = d.toISOString();
  }
  try {
    const row = createCode({
      code,
      kind: "setup_waiver",
      appliesTo: "setup",
      maxUses,
      expiresAt,
      note: String(req.body.note || "").trim().slice(0, 300) || null,
      createdBy: req.user.id,
    });
    res.status(201).json({ code: row });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "That code already exists." });
    throw e;
  }
});

adminRouter.patch("/codes/:id", (req, res) => {
  const info = db.prepare("UPDATE promo_codes SET active = ? WHERE id = ? AND film_id IS NULL").run(req.body.active ? 1 : 0, Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: "Code not found." });
  res.json({ ok: true });
});
