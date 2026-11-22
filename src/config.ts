// Business settings for the landing page. Edit these, not the components.

export const site = {
  name: "watchmyfilm.online",
  // Where the contact form at the bottom of the home page posts (e.g. a Formspree endpoint like
  // "https://formspree.io/f/xxxxxxx"). Leave empty until one is set up — the form
  // will say it isn't connected yet instead of pretending to send.
  formEndpoint: "https://formspree.io/f/xbgodbay",
  // Stripe Payment Link (customer chooses the amount) for the Donate section on the home page, e.g.
  // "https://buy.stripe.com/…". Leave empty until it exists: the section then says donations open soon.
  donateUrl: "https://buy.stripe.com/3cI9AU4pBfWOajh91e2sM00",
  // Real accounts (sign-in, dashboard, payments) need the API server. Until launch, sign-ups just email us.
  // Build with VITE_ACCOUNTS=open to switch them on.
  // The dev server has them on unless started with VITE_ACCOUNTS=closed.
  accountsOpen:
    import.meta.env.VITE_ACCOUNTS === "open" || (import.meta.env.DEV && import.meta.env.VITE_ACCOUNTS !== "closed"),
};

export const pricing = {
  stripePercent: 0.029,
  stripeFixed: 0.3,
  setupFee: 99, // what setup costs us to recover; filmmakers pay $0 up front (see setupUpfront)
  setupUpfront: false, // false: nothing up front, recovered with setupSurcharge per sale until setupFee is covered
  setupSurcharge: 1,
  foundingFilms: 5, // number of films that get the setup fee waived
  licensePercent: 0.05,
  tiers: {
    standard: { percent: 0.08, minimum: 0.5 },
    secure: { percent: 0.1, minimum: 0.75 },
  },
  examplePrices: [3.99, 5.99, 9.99, 24.99],
};

export type TierKey = keyof typeof pricing.tiers;

export function splitSale(price: number, tier: TierKey) {
  const t = pricing.tiers[tier];
  const stripe = round(price * pricing.stripePercent + pricing.stripeFixed);
  const fee = round(Math.max(price * t.percent, t.minimum));
  const filmmaker = round(price - stripe - fee);
  return { stripe, fee, filmmaker };
}

// What a filmmaker keeps of one ticket after our fee and Stripe's card fee, as a whole percent. Quoted at $19.99
// ("up to"): Stripe's flat 30¢ makes cheaper tickets keep less. Used by the home page and indiefilm.club's hero.
export function keepPercentAt(price: number) {
  const t = pricing.tiers.standard;
  const ours = Math.max(price * t.percent, t.minimum);
  const card = price * pricing.stripePercent + pricing.stripeFixed;
  return Math.round(((price - ours - card) / price) * 100);
}

const round = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => `$${n.toFixed(2)}`;
