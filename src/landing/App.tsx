import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { keepPercentAt, money, pricing, site, splitSale, type TierKey } from "../config";
import { getMe, type User } from "../api";
import { CLUB, cross } from "../sites";

/* Landing page. The interface stays neutral, like a screening room; color comes only from the films. */

const base = import.meta.env.BASE_URL;
const signupUrl = `${base}signup/`;
const HERO_VIDEO = "https://player.vimeo.com/video/1247031044?h=e64c86e166&background=1&dnt=1";

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

export default function App() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useReveal();

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav solid={pastHero} />
      <main id="main">
        <Hero frameRef={heroRef} />
        <LibraryShow />
        <Keep />
        <HowItWorks />
        <WhatYouGet />
        <Pricing />
        <Story />
        <Donate />
        <Faq />
        <Contact />
      </main>
      <footer className="footer">
        <div className="wrap footer-inner">
          <span className="wordmark">{site.name}</span>
          <span>Fully customizable paywall for independent films</span>
          <nav className="footer-links" aria-label="Legal">
            <a href={`${base}terms/`}>Terms</a>
            <a href={`${base}privacy/`}>Privacy</a>
          </nav>
        </div>
      </footer>
    </>
  );
}

// Text and elements fade in and drift up as they come into view (or on load if already visible).
// Skipped entirely with reduced motion.
const REVEAL = [
  ".film-title",
  ".film-tagline",
  ".watch-buttons",
  ".hero-copy > *",
  "main section:not(.hero) h2:not(.visually-hidden)",
  ".section-lede",
  ".sample-row li",
  ".strip li",
  ".two-col > div",
  ".calc",
  ".tiers > div",
  ".fine",
  ".keep-card",
  ".keep-punch",
  ".story-still",
  ".story-body > p",
  ".story-points > div",
  ".faq-item",
  ".contact-grid > :last-child",
].join(", ");

function useReveal() {
  // Layout effect: hide the elements before the first paint, so nothing flashes in and then disappears.
  useLayoutEffect(() => {
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    const els = [...document.querySelectorAll<HTMLElement>(REVEAL)];
    els.forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        // Stagger items that arrive together, top to bottom.
        entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
          .forEach((e, i) => {
            const el = e.target as HTMLElement;
            // Hero items have their own slower, staged timing in the CSS.
            if (!el.closest(".hero")) el.style.transitionDelay = `${Math.min(i, 6) * 70}ms`;
            el.classList.add("in");
            io.unobserve(el);
          });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Log in shows wherever sign-in exists: builds with accounts open, and the dev server.
const loginOn = site.accountsOpen || import.meta.env.DEV;

function Nav({ solid }: { solid: boolean }) {
  // Already signed in? Offer a way back in instead of Log in / Get started.
  const [me, setMe] = useState<User | null>(null);
  useEffect(() => {
    if (loginOn) getMe().then(setMe).catch(() => {});
  }, []);

  return (
    <header className={solid ? "nav solid" : "nav"}>
      <div className="wrap nav-inner">
        <a href="#main" className="wordmark logo-link" aria-label={`${site.name} home`}>
          <img
            src={`${import.meta.env.BASE_URL}brand/watchmyfilm-logo-white.png`}
            alt=""
            width={600}
            height={163}
            className="nav-logo"
          />
        </a>
        <nav aria-label="Main">
          <a href="#why">Why?</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#about">About us</a>
          {me ? (
            // A viewer's home is their library on indiefilm.club (a full address): go there signed in.
            <a href={/^https?:/.test(me.home) ? cross(me.home) : `${base}${me.home.replace(/^\//, "")}`} className="btn btn-small">
              {me.isAdmin ? "Admin" : /^https?:/.test(me.home) ? "My Library" : "Your films"}
            </a>
          ) : (
            <>
              {loginOn && (
                <a href={`${base}signin/`} className="nav-login">
                  Log in
                </a>
              )}
              <a href={signupUrl} className="btn btn-small">
                Get started
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/* ---------- Hero: the film's watch page, playing ---------- */

function Hero({ frameRef }: { frameRef: React.RefObject<HTMLDivElement> }) {
  const [video, setVideo] = useState<"off" | "loading" | "on">("off");

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || saveData()) return; // the still is the fallback
    setVideo("loading");
  }, []);

  // Keep the still showing until Vimeo says the clip is actually playing, so a slow load never shows an empty player.
  useEffect(() => {
    if (video !== "loading") return;
    const player = () => iframeRef.current?.contentWindow;
    const post = (msg: object) => player()?.postMessage(JSON.stringify(msg), "https://player.vimeo.com");
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== "https://player.vimeo.com" || e.source !== player()) return;
      let data: { event?: string; data?: { seconds?: number } };
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data.event === "ready") {
        post({ method: "addEventListener", value: "playProgress" });
        post({ method: "addEventListener", value: "play" });
      }
      if (data.event === "play" || (data.event === "playProgress" && (data.data?.seconds ?? 0) > 0.1)) setVideo("on");
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [video]);


  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="frame" ref={frameRef}>
        <img className="frame-still" src={`${base}landing/hero-poster.jpg`} alt="" width={1920} height={1080} fetchPriority="high" />
        {video !== "off" && (
          <iframe
            ref={iframeRef}
            className={video === "on" ? "frame-video on" : "frame-video"}
            src={HERO_VIDEO}
            title="Background clip of a cinema, muted"
            allow="autoplay; picture-in-picture"
            tabIndex={-1}
            aria-hidden="true"
          />
        )}
        <div className="scrim" aria-hidden="true" />
        <div className="watch-ui">
          <h1 id="hero-title" className="film-title headline">
            <span className="headline-line">Sell your film</span>{" "}
            <span className="headline-line">from your website</span>{" "}
            <span className="headline-line">
              and{" "}
              <a className="headline-link" href={`${CLUB}/`}>
                indiefilm.club
              </a>
            </span>
          </h1>
          <p className="film-tagline">
            You keep up to {keepPercentAt(19.99)}% of every ticket sale.
          </p>
          <div className="watch-buttons" aria-hidden="true">
            <span className="wbtn wbtn-rent">
              Rent for 48 hours <b>$5.99</b>
            </span>
            <span className="wbtn wbtn-buy">
              Buy <b>$12.99</b>
            </span>
          </div>
        </div>
      </div>

      <div className="wrap hero-copy">
        <div>
          <p className="lede">
            Build a free paywall storefront on your film's unique web address. Viewers rent, buy, or donate in two clicks, no sign-up needed.
            Every sale lands in your account, and the viewer list is yours.
          </p>
        </div>
        <div className="hero-act">
          <a href={signupUrl} className="btn">
            Start for free
          </a>
          <ul className="billing">
            <li>No monthly fee</li>
            <li>No exclusivity</li>
            <li>Custom domain</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- Our library: films on indiefilm.club, posters turning in like the club's New Arrivals ---------- */

// Films to show here. Add more as they go live: the posters take turns (turn + fade), and clicking one shows a
// screenshot of its real sales page.
type LibraryFilm = {
  id: string;
  title: string;
  poster: string; // 2:3
  salesShot: string; // screenshot of its watch page (rent / buy / pay what you want / free)
  link: string; // its live page on indiefilm.club
};

const libraryFilms: LibraryFilm[] = [
  {
    id: "fts",
    title: "Fracking the System: Colorado's Oil and Gas Wars",
    poster: `${base}sample/fts-poster.jpg`,
    salesShot: `${base}landing/fts-sales-page.jpg`,
    link: "https://frackingthesystem.indiefilm.club/",
  },
];

const LIB_EVERY_MS = 4000;

function LibraryShow() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false); // the first poster turns in when the section scrolls into view
  const [{ i, prev }, setStep] = useState<{ i: number; prev: number | null }>({ i: 0, prev: null });
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState<LibraryFilm | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setInView(true), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || paused || open || libraryFilms.length < 2) return;
    const t = setInterval(() => setStep((s) => ({ i: (s.i + 1) % libraryFilms.length, prev: s.i })), LIB_EVERY_MS);
    return () => clearInterval(t);
  }, [inView, paused, open]);

  const now = libraryFilms[i];
  // Hide the sales page and scroll back up to the Library (the section's top, just under the menu bar).
  const sectionRef = useRef<HTMLElement>(null);
  // Scroll first, then close once the scroll has settled: closing first shrinks the page under the scroll.
  const hide = () => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    sectionRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scrollend", close);
      setOpen(null);
    };
    if (reduce) return close();
    window.addEventListener("scrollend", close);
    setTimeout(close, 900); // browsers without "scrollend"
  };
  return (
    <section ref={sectionRef} className="samples lib" aria-labelledby="samples-title">
      <div className="wrap">
        <h2 id="samples-title">
          Browse our{" "}
          <a className="headline-link" href={`${CLUB}/`}>
            Library
          </a>
        </h2>
      </div>
      <div className="lib-stage" ref={stageRef}>
        <button
          type="button"
          className="lib-frame"
          onClick={() => (open?.id === now.id ? hide() : setOpen(now))}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          aria-expanded={open?.id === now.id}
          aria-controls="lib-sales"
          aria-label={`${now.title}: ${open?.id === now.id ? "hide" : "see"} its sales page`}
        >
          {libraryFilms.map((f, k) => (
            <img
              key={f.id}
              src={f.poster}
              alt=""
              width={600}
              height={900}
              className={inView && k === i ? "is-on" : k === prev ? "is-off" : undefined}
            />
          ))}
        </button>
        <p className="lib-hint">{open ? "Click the poster again to hide its sales page" : "Click the poster to see its sales page"}</p>
      </div>
      {/* The sales page opens right here in the section, below the poster (not an overlay). */}
      <div id="lib-sales" className={`lib-sales${open ? " is-open" : ""}`} aria-hidden={!open}>
        {open && <SalesShot film={open} onClose={hide} />}
      </div>
    </section>
  );
}

// A film's real sales page, as a screenshot, with a link to the live one.
function SalesShot({ film, onClose }: { film: LibraryFilm; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Scroll down to the screenshot as it opens (its top lands just under the menu bar).
  useEffect(() => {
    const t = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 120);
    return () => clearTimeout(t);
  }, [film.id]);
  return (
    <div ref={ref} className="lib-sales-inner wrap">
      <img src={film.salesShot} alt={`The sales page for ${film.title}: poster, rent, buy, pay what you want, and watch free`} />
      <p className="lib-sales-foot">
        <a href={film.link} target="_blank" rel="noopener">
          Open the live page ↗
        </a>
        <button type="button" className="link-btn" onClick={onClose}>
          Hide
        </button>
      </p>
    </div>
  );
}

/* ---------- How it works: a real sequence, laid out like frames on a strip ---------- */

function HowItWorks() {
  const steps = [
    {
      title: "Add your film",
      body: "Add your poster, trailer and prices. Your film plays from a private Vimeo link or an unlisted YouTube link on your own account. You approve the page before it goes live.",
    },
    {
      title: "Connect your accounts",
      body: "Connect your Stripe account if you are selling rentals or purchases. Sales are paid out directly to your bank on Stripe's normal schedule. Just want to share your film? Add your Venmo, PayPal or Zelle to the tip jar, let people watch for free.",
    },
    {
      title: "Share your link",
      body: "After we approve your film, point a 'Watch Now' button on your website at it, and use the same link in newsletters, social posts and screening Q&As.",
    },
  ];
  return (
    <section id="how" className="screen" aria-labelledby="how-title">
      <div className="wrap">
        <h2 id="how-title">From finished film to first sale</h2>
        <ol className="strip">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="strip-num" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function WhatYouGet() {
  return (
    <section className="screen tight" aria-labelledby="get-title">
      <div className="wrap two-col">
        <h2 id="get-title" className="visually-hidden">
          What viewers get and what you keep
        </h2>
        <div>
          <h3>Your viewers</h3>
          <ul className="lines">
            <li>Rent or buy without creating a password; they sign in with a link sent to their email</li>
            <li>Pay by card, Apple Pay or Google Pay</li>
            <li>Watch on a phone or laptop, or cast to a TV</li>
            <li>Turn on captions in the player</li>
          </ul>
        </div>
        <div>
          <h3>You</h3>
          <ul className="lines">
            <li>Every sale goes to your own Stripe account, and tips go straight to your Venmo, PayPal or Zelle</li>
            <li>Get a list of everyone who watched, ready to export</li>
            <li>Your prices, your rental window, promo codes and free press screeners</li>
            <li>No exclusivity. Sell on any other platform too</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- Pricing calculator ---------- */

// Eases a number toward its new value so changes are easy to follow.
function useTween(target: number, ms = 260) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const v = a + (target - a) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function Pricing() {
  const [price, setPrice] = useState(5.99);
  // One plan for now (Secure, with hosting we pay for, is paused). Its numbers stay in config for later.
  const tier: TierKey = "standard";
  const split = useMemo(() => splitSale(price, tier), [price, tier]);
  const you = useTween(split.filmmaker);
  const us = useTween(split.fee);
  const stripe = useTween(split.stripe);
  const pct = (n: number) => `${((n / price) * 100).toFixed(1)}%`;
  const { standard } = pricing.tiers;

  return (
    <section id="pricing" className="house pricing" aria-labelledby="pricing-title">
      <div className="wrap">
        <h2 id="pricing-title">No monthly fee.</h2>

        <div className="calc">
          <div className="calc-controls">
            <div className="seg" role="radiogroup" aria-label="Ticket price">
              {pricing.examplePrices.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={price === p} onClick={() => setPrice(p)}>
                  {money(p)}
                </button>
              ))}
            </div>
          </div>

          <div className="split-bar" aria-hidden="true">
            <span className="s-you" style={{ flexGrow: split.filmmaker }} />
            <span className="s-us" style={{ flexGrow: split.fee }} />
            <span className="s-stripe" style={{ flexGrow: split.stripe }} />
          </div>

          <dl className="split">
            <div className="you">
              <dt>You keep</dt>
              <dd>
                <span className="num">{money(you)}</span> <small>{pct(split.filmmaker)}</small>
              </dd>
            </div>
            <div>
              <dt>{site.name}</dt>
              <dd>
                <span className="num">{money(us)}</span> <small>{pct(split.fee)}</small>
              </dd>
            </div>
            <div>
              <dt>Stripe card fee</dt>
              <dd>
                <span className="num">{money(stripe)}</span> <small>{pct(split.stripe)}</small>
              </dd>
            </div>
          </dl>
          <p className="calc-note">
            Shown after setup is covered. A {money(pricing.setupFee).replace(".00", "")} setup fee is deducted{" "}
            {money(pricing.setupSurcharge).replace(".00", "")} at a time from sales until it is collected.
          </p>
          <p className="visually-hidden" aria-live="polite">
            At {money(price)}, you keep {money(split.filmmaker)}.
          </p>
        </div>

        <div className="tiers">
          <div>
            <h3>Platform fee</h3>
            <p className="rate">
              {standard.percent * 100}% per sale <span>minimum {money(standard.minimum)}</span>
            </p>
            <p>Covers your watch page, checkout, viewer access and your viewer list. No monthly fee.</p>
          </div>
          <div>
            <h3>Your film stays on your account</h3>
            <p>
              Your film plays behind the paywall from a private Vimeo link or an unlisted YouTube link, so your own account
              covers the streaming. Vimeo is the safer choice: we lock it so it only plays on your watch page. An unlisted
              YouTube link plays anywhere it's shared.
            </p>
          </div>
        </div>

        <div className="pricing-foot">
        <ul className="fine">
          <li>
            Setup: we build your page, connect Stripe and run a test purchase together. We recover the{" "}
            {money(pricing.setupFee).replace(".00", "")} setup cost with {money(pricing.setupSurcharge).replace(".00", "")} per
            sale until it's paid off.
          </li>
          <li>Stripe's card fee is 2.9% + 30¢ per sale.</li>
        </ul>

        <a href={signupUrl} className="btn pricing-cta">
          Get started
        </a>
        </div>
      </div>
    </section>
  );
}

/* ---------- Keep more of every viewer: what one viewer is worth on each route ---------- */

// Every number in this section. Change them here; the percentages and dollar amounts are computed from these.
// Our own fees come from `pricing` in config.ts so this section always agrees with the calculator above.

const KEEP = {
  ticket: 5.99, // the example rental price
  tubi: { platformShare: 0.5, perStream: 0.004, perStreamRange: [0.002, 0.008] }, // filmmaker's estimated take per stream
  amazon: { storeShare: 0.5 }, // Prime Video Direct pays 50% on rentals
  apple: { storeShare: 0.3 }, // Apple pays about 70%
  aggregatorShare: 0.2, // of whatever the platform pays out
  stripePercent: pricing.stripePercent,
  stripeFixed: pricing.stripeFixed,
  ourPercent: pricing.tiers.standard.percent,
  ourMinimum: pricing.tiers.standard.minimum,
};

type Slice = { key: "you" | "platform" | "agg" | "card"; label: string; amount: number };
type Route = { id: string; name: string; what: string; slices: Slice[]; unit: string; note?: string; decimals: number };

const cents = (n: number) => Math.round(n * 100) / 100;

function keepRoutes(): Route[] {
  const k = KEEP;
  // Tubi: work back from the per-stream estimate to the ad revenue that stream earned.
  const tubiPayout = k.tubi.perStream / (1 - k.aggregatorShare);
  const tubiGross = tubiPayout / (1 - k.tubi.platformShare);
  // Stores: the store keeps its share, the aggregator takes its cut of the rest.
  const store = (share: number) => {
    const payout = k.ticket * (1 - share);
    const agg = payout * k.aggregatorShare;
    return { store: k.ticket * share, agg, you: payout - agg };
  };
  const amazon = store(k.amazon.storeShare);
  const apple = store(k.apple.storeShare);
  const card = cents(k.ticket * k.stripePercent + k.stripeFixed);
  const fee = cents(Math.max(k.ticket * k.ourPercent, k.ourMinimum));
  const range = k.tubi.perStreamRange.map((n) => `$${n.toFixed(3)}`).join(" to ");

  return [
    {
      id: "tubi",
      name: "Tubi/AVOD",
      what: "One ad-supported stream",
      unit: "per stream",
      decimals: 3,
      note: `Ad-supported, so there's no ticket. Typical indie payouts run ${range} per stream.`,
      slices: [
        { key: "you", label: "Filmmaker", amount: k.tubi.perStream },
        { key: "platform", label: "Tubi's share of ad revenue", amount: tubiGross - tubiPayout },
        { key: "agg", label: "Aggregator", amount: tubiPayout - k.tubi.perStream },
      ],
    },
    {
      id: "stores",
      name: "Amazon / Apple - TVOD",
      what: `One ${money(k.ticket)} rental, through an aggregator`,
      unit: "per rental",
      decimals: 2,
      note: `Apple pays about ${Math.round((1 - k.apple.storeShare) * 100)}% before the aggregator, so roughly ${money(apple.you)}.`,
      slices: [
        { key: "you", label: "Filmmaker", amount: amazon.you },
        { key: "platform", label: "Store's share", amount: amazon.store },
        { key: "agg", label: "Aggregator", amount: amazon.agg },
      ],
    },
    {
      id: "us",
      name: `${site.name} - TVOD`,
      what: `One ${money(k.ticket)} rental`,
      unit: "per rental",
      decimals: 2,
      note: "Paid straight to your own Stripe account.",
      slices: [
        { key: "you", label: "Filmmaker", amount: cents(k.ticket - card - fee) },
        { key: "platform", label: `${site.name} fee`, amount: fee },
        { key: "card", label: "Card processing", amount: card },
      ],
    },
  ];
}

// Whole percentages that always add up to 100 (largest remainder).
function wholePercents(values: number[]) {
  const total = values.reduce((a, b) => a + b, 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let n = 100 - out.reduce((a, b) => a + b, 0), j = 0; n > 0; n--, j++) out[order[j][1]]++;
  return out;
}

function Donut({ route, pcts, active, setActive }: { route: Route; pcts: number[]; active: string | null; setActive: (k: string | null) => void }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const total = route.slices.reduce((a, s) => a + s.amount, 0);
  const gap = 1.2; // about 2px at the drawn size
  let at = 0;
  return (
    <svg className="donut" viewBox="0 0 100 100" aria-hidden="true">
      {route.slices.map((s) => {
        const len = (s.amount / total) * c;
        const seg = (
          <circle
            key={s.key}
            className={`slice k-${s.key}${active === s.key ? " on" : ""}${active && active !== s.key ? " off" : ""}`}
            cx="50"
            cy="50"
            r={r}
            strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
            strokeDashoffset={-at}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
          />
        );
        at += len;
        return seg;
      })}
      <text x="50" y="50" className="donut-pct">
        {pcts[0]}%
      </text>
      <text x="50" y="63" className="donut-sub">
        to you
      </text>
    </svg>
  );
}

function KeepCard({ route }: { route: Route }) {
  const [active, setActive] = useState<string | null>(null);
  const pcts = wholePercents(route.slices.map((s) => s.amount));
  const you = route.slices[0].amount;
  const fmt = (n: number) => `$${n.toFixed(route.decimals)}`;
  return (
    <article className={`keep-card${route.id === "us" ? " ours" : ""}`} aria-labelledby={`keep-${route.id}`}>
      <h3 id={`keep-${route.id}`}>{route.name}</h3>
      <p className="keep-what">{route.what}</p>
      <div className="keep-top">
        <Donut route={route} pcts={pcts} active={active} setActive={setActive} />
        <p className="keep-you">
          <span className="keep-you-label">{route.id === "tubi" ? "You get about" : "You get"}</span>
          <span className="keep-you-num">{fmt(you)}</span>
          <span className="keep-you-unit">{route.unit}</span>
        </p>
      </div>
      <ul className="keep-legend" aria-label={`Where the money goes: ${route.name}`}>
        {route.slices.map((s, i) => (
          <li
            key={s.key}
            className={active === s.key ? "on" : undefined}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
          >
            <span className={`sw k-${s.key}`} aria-hidden="true" />
            <span className="lg-label">{s.label}</span>
            <span className="lg-pct">{pcts[i]}%</span>
            <span className="lg-amt">{fmt(s.amount)}</span>
          </li>
        ))}
      </ul>
      {route.note && <p className="keep-note">{route.note}</p>}
    </article>
  );
}

function Keep() {
  const routes = useMemo(keepRoutes, []);
  return (
    <section id="why" className="house keep" aria-labelledby="keep-title">
      <div className="wrap">
        <h2 id="keep-title">Keep more of your sales.</h2>
        <p className="section-lede">Where the money goes from one stream or one {money(KEEP.ticket)} rental.</p>
        <div className="keep-grid">
          {routes.map((r) => (
            <KeepCard key={r.id} route={r} />
          ))}
        </div>
        <p className="keep-punch">
          One rental on your own storefront earns about what a thousand Tubi streams do. And you keep your viewer list.
        </p>
        <p className="keep-foot">Estimates for illustration. Store, aggregator and ad-revenue terms vary by platform and deal.</p>
      </div>
    </section>
  );
}

/* ---------- Story ---------- */

function Story() {
  return (
    <section id="about" className="screen story" aria-labelledby="story-title">
      <div className="wrap story-grid">
        <figure className="story-still">
          <img src={`${base}landing/fts-still.jpg`} alt="Fracking the System: a girl with a pink backpack walks toward a refinery at sunset" loading="lazy" width={1280} height={720} />
          <figcaption>Fracking the System (2024)</figcaption>
        </figure>
        <div className="story-body">
          <h2 id="story-title">By filmmakers, for filmmakers</h2>
          <p>
            When I finished my documentary <em>Fracking the System</em>, I tried the usual routes for independent films,
            like Vimeo On Demand and Gathr. None of them gave me the control I wanted over how my film was presented,
            priced and shared, or a direct line to the people who watched it.
          </p>
          <p>
            So I built my own watch page at{" "}
            <a href="https://frackingthesystem.com" target="_blank" rel="noopener">
              frackingthesystem.com
            </a>
            . {site.name} is that same setup for other filmmakers: the best viewing experience for your audience, and as
            much of each sale as possible back in your pocket.
          </p>
          <dl className="story-points">
            <div>
              <dt>No exclusivity</dt>
              <dd>
                You stay in control of your film's rights. We're software, not a distributor: our job is to give your
                audience the best possible way to watch.
              </dd>
            </div>
            <div>
              <dt>Your viewer list comes with you</dt>
              <dd>Connect directly with your audience after they watch your film.</dd>
            </div>
            <div>
              <dt>Transparency</dt>
              <dd>A live dashboard shows you how your film is doing.</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ---------- Donate ---------- */

function Donate() {
  return (
    <section id="donate" className="screen donate" aria-labelledby="donate-title">
      <div className="wrap donate-grid">
        <div>
          <h2 id="donate-title">Help keep our projectors on</h2>
          <p className="section-lede">
            {site.name} is a grassroots service, built by filmmakers, for filmmakers. There are no investors and no monthly
            fees, just a small share of each sale to keep the lights on.
          </p>
          <p className="donate-body">
            If it helped your film, or you'd like to see more independent films sold on their makers' own terms, you can
            chip in toward hosting and development. Every bit goes into keeping the service running and free to start.
          </p>
        </div>
        <div className="donate-act">
          {site.donateUrl ? (
            <>
              <a href={site.donateUrl} className="btn" target="_blank" rel="noopener">
                Donate
              </a>
              <p className="donate-fine">Any amount. Secure checkout by Stripe. Donations aren't tax-deductible.</p>
            </>
          ) : (
            <p className="donate-fine">Donations open soon.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- Questions ---------- */

const faqs = [
  { q: "Do I need my own domain?", a: "No. Every film gets an address like yourfilm.watchmyfilm.online. If you already own a domain, we can put the page at watch.yourfilm.com instead." },
  { q: "Who actually receives the money?", a: "You do. Each sale is charged on your own Stripe account, our fee is deducted automatically, and Stripe pays the rest out to your bank. Tips from the tip jar go straight to your Venmo, PayPal or Zelle, and we take nothing from them." },
  { q: "Do I need a Stripe account?", a: "Only if you sell rentals or purchases. If you just want people to watch your film, let them watch for free and add your Venmo, PayPal or Zelle to the tip jar. You can go live without Stripe and add it later." },
  { q: "Can I keep selling on other platforms?", a: "Yes. There's no exclusivity, and you can leave whenever you want. Your viewer list comes with you." },
  {
    q: "What happens to my buyers if watchmyfilm.online shuts down?",
    a: "You keep everything you need to look after them. Every sale was already paid into your own Stripe account, so there's no balance waiting with us. Your viewer list is yours to export at any time, so you can email every buyer directly. And your film stays yours: it lives on your own Vimeo or YouTube account. With those, you can give your buyers access somewhere else.",
  },
  { q: "Can people pirate it?", a: "No streaming site can stop someone determined to record their screen. A private Vimeo link stops casual sharing: we lock it so the video won't play anywhere but your page. An unlisted YouTube link is easier to pass around, so choose Vimeo if that matters to you." },
  { q: "What about sales tax?", a: "You're the seller, so tax registration is yours. Stripe can calculate and collect sales tax and VAT on each sale, and we'll help you switch it on during setup." },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();
  return (
    <section id="faq" className="screen" aria-labelledby="faq-title">
      <div className="wrap">
        <h2 id="faq-title">Questions filmmakers ask</h2>
        <div className="faq">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className={isOpen ? "faq-item open" : "faq-item"}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`${baseId}-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {f.q}
                    <span className="faq-mark" aria-hidden="true" />
                  </button>
                </h3>
                <div className="faq-a" id={`${baseId}-${i}`} role="region" aria-hidden={!isOpen}>
                  <div>
                    <p>{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- Contact ---------- */

function Contact() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch(site.formEndpoint, { method: "POST", headers: { Accept: "application/json" }, body: new FormData(e.currentTarget) });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id="contact" className="house contact" aria-labelledby="contact-title">
      <div className="wrap contact-grid">
        <div>
          <h2 id="contact-title">Have questions? Reach out to us</h2>
          <p className="section-lede">Ask us anything about selling your film. We'll get back to you by email.</p>
        </div>
        {status === "sent" ? (
          <p className="form-msg" role="status">
            Thanks! We'll be in touch soon.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="form">
            <label>
              Your name
              <input name="name" required autoComplete="name" />
            </label>
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label className="full">
              Film title (optional)
              <input name="film" />
            </label>
            <label className="full">
              Your question
              <textarea name="message" rows={5} required />
            </label>
            <input type="hidden" name="_subject" value={`${site.name} question`} />
            <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
            <div className="full form-foot">
              <button type="submit" className="btn" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send message"}
              </button>
              {status === "error" && (
                <p className="form-err" role="alert">
                  Your message didn't go through. Check your connection and send it again.
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
