// Film record as the API returns it, shared by the dashboard and admin pages.

export type Credit = { role: string; names: string[] };

export type Film = {
  id: number;
  title: string;
  logline: string | null;
  synopsis: string | null;
  director: string | null;
  year: number | null;
  runtime_minutes: number | null;
  genre: string | null;
  languages: string | null;
  credits: Credit[];
  poster_url: string | null;
  still_url: string | null;
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
  editable: boolean;
};

export type FilmsResponse = { films: Film[]; setupFeeCents: number; checkoutEnabled: boolean };

export const STATUS_LABEL: Record<Film["status"], string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  live: "Live",
};
