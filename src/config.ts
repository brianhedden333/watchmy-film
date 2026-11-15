// Business settings for the landing page. Edit these, not the components.

export const site = {
  name: "watchmyfilm.online",
  // Where the contact form at the bottom of the home page posts (e.g. a Formspree endpoint like
  // "https://formspree.io/f/xxxxxxx"). Leave empty until one is set up — the form
  // will say it isn't connected yet instead of pretending to send.
  formEndpoint: "https://formspree.io/f/xbgodbay",
  // Real accounts (sign-in, dashboard, payments) need the API server. Until launch, sign-ups just email us.
  // Build with VITE_ACCOUNTS=open to switch them on.
  accountsOpen: import.meta.env.VITE_ACCOUNTS === "open",
};

export const pricing = {
  stripePercent: 0.029,
  stripeFixed: 0.3,
  setupFee: 249,
  foundingFilms: 5, // number of films that get the setup fee waived
  licensePercent: 0.05,
  tiers: {
    standard: { percent: 0.08, minimum: 0.5 },
    secure: { percent: 0.1, minimum: 0.75 },
  },
  examplePrices: [3.99, 5.99, 9.99, 12.99],
};

export type TierKey = keyof typeof pricing.tiers;

export function splitSale(price: number, tier: TierKey) {
  const t = pricing.tiers[tier];
  const stripe = round(price * pricing.stripePercent + pricing.stripeFixed);
  const fee = round(Math.max(price * t.percent, t.minimum));
  const filmmaker = round(price - stripe - fee);
  return { stripe, fee, filmmaker };
}

const round = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => `$${n.toFixed(2)}`;
