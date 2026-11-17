import type { CSSProperties } from "react";

// Film record as the API returns it, shared by the dashboard and admin pages.

export type Credit = { role: string; names: string[] };

// Bonus features: rentals get `rent`, purchases get `buy`. Up to 10 videos each.
export type BonusVideo = { title: string; url: string };
export type BonusSet = { description: string; videos: BonusVideo[] };
export type Bonus = { rent: BonusSet; buy: BonusSet };
export const BONUS_MAX = 10;

export type Film = {
  id: number;
  user_id: number;
  title: string;
  logline: string | null;
  synopsis: string | null;
  director: string | null;
  year: number | null;
  runtime_minutes: number | null;
  genre: string | null;
  languages: string | null;
  credits: Credit[];
  bonus: Bonus;
  poster_url: string | null;
  still_url: string | null;
  banner_url: string | null;
  trailer_url: string | null;
  vimeo_url: string | null;
  rent_price_cents: number | null;
  buy_price_cents: number | null;
  rental_days: number | null;
  rental_hours: number | null;
  tier: "standard" | "secure";
  address_type: "sub" | "own";
  subdomain: string | null;
  own_domain: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  color_background: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  color_button: string | null;
  notes: string | null;
  status: "draft" | "in_review" | "changes_requested" | "approved" | "live";
  setup_status: "unpaid" | "paid" | "waived";
  admin_note: string | null;
  missing: string[];
  hidden: boolean;
  editable: boolean;
};

export type FilmsResponse = { films: Film[]; setupFeeCents: number; checkoutEnabled: boolean };

// Label and pill style, counting a hidden live film as "Hidden".
export const statusLabel = (f: Pick<Film, "status" | "hidden">) => (f.status === "live" && f.hidden ? "Hidden" : STATUS_LABEL[f.status]);
export const pillClass = (f: Pick<Film, "status" | "hidden">) => `pill pill-${f.status === "live" && f.hidden ? "hidden" : f.status}`;

export const STATUS_LABEL: Record<Film["status"], string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  live: "Live",
};

// Watch page colors: what each one falls back to when the filmmaker leaves it empty.
export type ColorKey = "color_background" | "color_primary" | "color_secondary" | "color_button";
export const COLOR_DEFAULTS: Record<ColorKey, string> = {
  color_background: "#111111",
  color_primary: "#ffffff",
  color_secondary: "#b3b3b3",
  color_button: "#4a1424",
};

// The watch page's color variables (see sample.css) from a film's four colors. Empty or invalid → our default.
export function pageTheme(colors: Partial<Record<ColorKey, string | null>>): CSSProperties {
  const c = (k: ColorKey) => (/^#[0-9a-fA-F]{6}$/.test(colors[k] || "") ? colors[k]! : COLOR_DEFAULTS[k]);
  const bg = c("color_background");
  const btn = c("color_button");
  return {
    "--s-bg": bg,
    "--s-card": `color-mix(in srgb, ${bg} 90%, ${textOn(bg)})`,
    "--s-line": `color-mix(in srgb, ${bg} 78%, ${textOn(bg)})`,
    "--s-head": c("color_primary"),
    "--s-text": c("color_secondary"),
    "--s-soft": c("color_secondary"),
    "--s-faint": `color-mix(in srgb, ${c("color_secondary")} 70%, ${bg})`,
    "--s-red": btn,
    "--s-red-hover": `color-mix(in srgb, ${btn} 85%, ${textOn(btn)})`,
    "--s-btn-text": textOn(btn),
  } as CSSProperties;
}

// Black or white text, whichever reads better on the given #rrggbb color.
export const textOn = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#111111" : "#ffffff";
};
