import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { money, pricing, site, splitSale, type TierKey } from "../config";
import { getMe, type User } from "../api";

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
        <Samples />
        <HowItWorks />
        <WhatYouGet />
        <Pricing />
        <Story />
        <Compare />
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
  ".story-still",
  ".story-body > p",
  ".story-points > div",
  ".table-scroll",
  ".fine-note",
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
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#about">About us</a>
          <a href="#faq">Questions</a>
          {me ? (
            <a href={`${base}${me.home.replace(/^\//, "")}`} className="btn btn-small">
              {me.isAdmin ? "Admin" : "Your films"}
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
            Sell your film from your own website.
          </h1>
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
            {site.name} builds a paywall on your film's own web address. Viewers rent or buy in two clicks, no sign-up
            needed. Every sale lands in your Stripe account, and the viewer list is yours.
          </p>
        </div>
        <div className="hero-act">
          <a href={signupUrl} className="btn">
            Get started
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

/* ---------- Samples: three watch pages, each themed by its own poster ---------- */

type SampleFilm = {
  id: string;
  title: string;
  placeholder?: boolean;
  poster: string;
  still: string; // wide 16:9 image, shown instead of the poster on phones
  link?: string; // a real watch page: Rent and Buy go there instead of closing the sample
  accent: string;
  logline: string;
  meta: string;
  rent: { price: string; terms: string };
  buy: { price: string; terms: string };
};

const samples: SampleFilm[] = [
  {
    id: "fts",
    title: "Fracking the System",
    poster: `${base}sample/fts-poster.jpg`,
    still: `${base}landing/fts-still.jpg`,
    link: "https://www.frackingthesystem.com/watch-now",
    accent: "#f63052",
    logline:
      "An investigative documentary about climate justice activism in Colorado and the oil and gas industry's tactics to undermine democracy.",
    meta: "Documentary, 2024, 93 minutes",
    rent: { price: "$4.99", terms: "30 days to start watching, 72 hours to finish" },
    buy: { price: "$14.99", terms: "Watch any time, plus bonus Q&A recordings" },
  },
  {
    id: "feature",
    title: "Your feature here",
    placeholder: true,
    poster: `${base}landing/placeholder-feature.svg`,
    still: `${base}landing/placeholder-feature-wide.svg`,
    accent: "#3fb8ac",
    logline: "Placeholder film. This is where your logline goes, set in the colors pulled from your poster.",
    meta: "Feature, placeholder",
    rent: { price: "$5.99", terms: "48 hours to watch" },
    buy: { price: "$12.99", terms: "Watch any time" },
  },
  {
    id: "short",
    title: "Your short here",
    placeholder: true,
    poster: `${base}landing/placeholder-short.svg`,
    still: `${base}landing/placeholder-short-wide.svg`,
    accent: "#e9a23b",
    logline: "Placeholder film. A short can sell on its own page too, with its own prices and rental window.",
    meta: "Short, placeholder",
    rent: { price: "$2.99", terms: "48 hours to watch" },
    buy: { price: "$6.99", terms: "Watch any time" },
  },
];

// Black or white text, whichever reads better on the accent.
const inkOn = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? "#000000" : "#ffffff";
};

function Samples() {
  const [open, setOpen] = useState<SampleFilm | null>(null);
  return (
    <section className="samples" aria-labelledby="samples-title">
      <div className="wrap">
        <h2 id="samples-title">Three films, three watch pages</h2>
      </div>
      <ul className="sample-row">
        {samples.map((f) => (
          <li key={f.id} style={{ "--accent": f.accent, "--ink": inkOn(f.accent) } as React.CSSProperties}>
            <button type="button" className="sample-tile" onClick={() => setOpen(f)} aria-haspopup="dialog">
              <img src={f.poster} alt={f.placeholder ? "Placeholder poster" : `${f.title} poster`} loading="lazy" width={600} height={900} />
              <span className="sample-title">{f.title}</span>
              <span className="sample-meta">
                Rent {f.rent.price}, buy {f.buy.price}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && <SampleDialog film={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function SampleDialog({ film, onClose }: { film: SampleFilm; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"rent" | "buy">("rent");
  const titleId = useId();

  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const close = () => onClose();
    d.addEventListener("close", close);
    return () => d.removeEventListener("close", close);
  }, [onClose]);

  const offer = film[mode];
  return (
    <dialog
      ref={ref}
      className="sample-dialog"
      aria-labelledby={titleId}
      style={{ "--accent": film.accent, "--ink": inkOn(film.accent) } as React.CSSProperties}
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      <div className="sd-inner">
        <picture className="sd-poster">
          <source media="(max-width: 640px)" srcSet={film.still} />
          <img src={film.poster} alt="" />
        </picture>
        <div className="sd-body">
          <p className="sd-flag">{film.placeholder ? "Placeholder sample" : "Sample watch page"}</p>
          <h3 id={titleId}>{film.title}</h3>
          <p className="sd-meta">{film.meta}</p>
          <p>{film.logline}</p>
          <div className="sd-toggle" role="radiogroup" aria-label="Rent or buy">
            {(["rent", "buy"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                {m === "rent" ? "Rent" : "Buy"}
              </button>
            ))}
          </div>
          <p className="sd-price" aria-live="polite">
            <b>{offer.price}</b> {offer.terms}
          </p>
          {film.link ? (
            <>
              <a className="sd-cta" href={film.link} target="_blank" rel="noopener">
                {mode === "rent" ? `Rent for ${offer.price}` : `Buy for ${offer.price}`}
              </a>
              <p className="sd-note">Opens the film's real watch page in a new tab.</p>
            </>
          ) : (
            <>
              <button type="button" className="sd-cta" onClick={() => ref.current?.close()}>
                {mode === "rent" ? `Rent for ${offer.price}` : `Buy for ${offer.price}`}
              </button>
              <p className="sd-note">This is a sample. Nothing is charged.</p>
            </>
          )}
        </div>
        <button type="button" className="sd-close" onClick={() => ref.current?.close()} aria-label="Close sample">
          ×
        </button>
      </div>
    </dialog>
  );
}

/* ---------- How it works: a real sequence, laid out like frames on a strip ---------- */

function HowItWorks() {
  const steps = [
    {
      title: "Add your film",
      body: "Add your poster, trailer and prices. Keep the film on your own Vimeo account, or let us stream it with download-resistant links. You approve the page before it goes live.",
    },
    {
      title: "Connect your Stripe account",
      body: "Sales are charged on your own account and paid out to your bank on Stripe's normal schedule. We never hold your money.",
    },
    {
      title: "Share your link",
      body: "Point a 'Watch Now' button on your website at it, and use the same link in newsletters, social posts and screening Q&As.",
    },
  ];
  return (
    <section id="how" className="house" aria-labelledby="how-title">
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
    <section className="house tight" aria-labelledby="get-title">
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
            <li>Every sale goes to your own Stripe account</li>
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
  const [tier, setTier] = useState<TierKey>("standard");
  const split = useMemo(() => splitSale(price, tier), [price, tier]);
  const you = useTween(split.filmmaker);
  const us = useTween(split.fee);
  const stripe = useTween(split.stripe);
  const pct = (n: number) => `${((n / price) * 100).toFixed(1)}%`;
  const { standard, secure } = pricing.tiers;

  return (
    <section id="pricing" className="screen pricing" aria-labelledby="pricing-title">
      <div className="wrap">
        <h2 id="pricing-title">No monthly fee. {money(pricing.setupFee).replace(".00", "")} one-time setup cost.</h2>

        <div className="calc">
          <div className="calc-controls">
            <div className="seg" role="radiogroup" aria-label="Ticket price">
              {pricing.examplePrices.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={price === p} onClick={() => setPrice(p)}>
                  {money(p)}
                </button>
              ))}
            </div>
            <div className="seg" role="radiogroup" aria-label="Plan">
              {(["standard", "secure"] as TierKey[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={tier === k} onClick={() => setTier(k)}>
                  {k === "standard" ? "Standard" : "Secure"}
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
          <p className="visually-hidden" aria-live="polite">
            At {money(price)} on {tier === "standard" ? "Standard" : "Secure"}, you keep {money(split.filmmaker)}.
          </p>
        </div>

        <div className="tiers">
          <div>
            <h3>Standard</h3>
            <p className="rate">
              {standard.percent * 100}% per sale <span>minimum {money(standard.minimum)}</span>
            </p>
            <p>
              Your film streams behind a secure paywall, from your own Vimeo account, locked so it only plays on your watch
              page. That stops casual sharing. Your Vimeo plan covers the streaming.
            </p>
          </div>
          <div>
            <h3>Secure</h3>
            <p className="rate">
              {secure.percent * 100}% per sale <span>minimum {money(secure.minimum)}</span>
            </p>
            <p>
              We host and stream the film with links that expire after each viewing session, which makes it much harder to
              download. Streaming costs are included. Choose this if a distributor or festival requires it.
            </p>
          </div>
        </div>

        <ul className="fine">
          <li>Setup is {money(pricing.setupFee).replace(".00", "")} once: your page, Stripe connection and a test purchase together.</li>
          <li>Stripe's card fee is 2.9% + 30¢ per sale on any plan.</li>
        </ul>
      </div>
    </section>
  );
}

/* ---------- Story ---------- */

function Story() {
  return (
    <section id="about" className="house story" aria-labelledby="story-title">
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

/* ---------- How we compare (checked Nov 14, 2026; recheck before changing) ---------- */

type Rival = { name: string; plan?: string; builtFor: string; fees: string[]; rental: string; setup: string; us?: boolean };

const rivals: Rival[] = [
  { name: site.name, builtFor: "Selling your film from its own website", fees: [`$${pricing.setupFee} one-time setup`, "No monthly fee", "8%–10% platform fee per sale"], rental: "$0.50–$0.75", setup: "Done for you", us: true },
  { name: "Eventive", plan: "Virtual Single Film", builtFor: "Festival-style virtual screenings", fees: ["$299 one-time", "2.1% + 69¢–99¢ ticketing fee per sale", "99¢ streaming fee per viewer after the first 100"], rental: "$0.82–$1.81", setup: "Self-serve" },
  { name: "MediaZilla", plan: "Growth", builtFor: "Video storefronts", fees: ["$37 monthly, billed annually ($444 a year)", "0% per sale"], rental: "$0", setup: "Self-serve" },
  { name: "Uscreen", plan: "Starter", builtFor: "Video memberships", fees: ["$49 monthly", "10% per sale"], rental: "$0.60", setup: "Self-serve" },
  { name: "Vimeo OTT", plan: "Starter", builtFor: "Subscription channels", fees: ["$1 monthly per subscriber", "10% per sale"], rental: "$0.60", setup: "Self-serve" },
  { name: "Dacast", plan: "Event", builtFor: "Live events", fees: ["$63 monthly, billed annually ($756 a year)", "9.9% + 40¢ per sale, card processing included"], rental: "$0.99*", setup: "Self-serve" },
  { name: "Vodlix", plan: "Launch", builtFor: "Streaming services", fees: ["$99 monthly, or $990 annually", "0% per sale"], rental: "$0", setup: "Self-serve" },
  { name: "Gumroad", builtFor: "Digital downloads", fees: ["No monthly fee", "10% + 50¢ per sale"], rental: "$1.10", setup: "Self-serve" },
  { name: "Payhip", plan: "Free Forever", builtFor: "Downloads and courses", fees: ["No monthly fee", "5% per sale"], rental: "$0.30", setup: "Self-serve" },
];

function Compare() {
  return (
    <section id="compare" className="screen" aria-labelledby="compare-title">
      <div className="wrap">
        <h2 id="compare-title">How we compare</h2>
        <p className="section-lede">What it costs to sell a film on each platform, from their own pricing pages.</p>
        <div className="table-scroll" role="region" aria-labelledby="compare-title" tabIndex={0}>
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">Platform</th>
                <th scope="col">Built for</th>
                <th scope="col">Fees</th>
                <th scope="col" className="num-col">
                  Platform fee on a $5.99 rental
                </th>
                <th scope="col">Setup</th>
              </tr>
            </thead>
            <tbody>
              {rivals.map((r) => (
                <tr key={r.name} className={r.us ? "us" : undefined}>
                  <th scope="row">
                    {r.name}
                    {r.plan && <span>{r.plan}</span>}
                  </th>
                  <td>{r.builtFor}</td>
                  <td>
                    <ul>
                      {r.fees.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="num-col">{r.rental}</td>
                  <td>{r.setup}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine-note">
          Prices checked November 2026 and can change. Card processing (about 2.9% + 30¢ per sale through Stripe) is extra
          on every platform except where marked *. Our platform fee has a minimum of 50¢ (Standard) or 75¢ (Secure) per
          sale.
        </p>
      </div>
    </section>
  );
}

/* ---------- Questions ---------- */

const faqs = [
  { q: "Do I need my own domain?", a: "No. Every film gets an address like yourfilm.watchmyfilm.online. If you already own a domain, we can put the page at watch.yourfilm.com instead." },
  { q: "Who actually receives the money?", a: "You do. Each sale is charged on your own Stripe account, our fee is deducted automatically, and Stripe pays the rest out to your bank." },
  { q: "Can I keep selling on other platforms?", a: "Yes. There's no exclusivity, and you can leave whenever you want. Your viewer list comes with you." },
  {
    q: "What happens to my buyers if watchmyfilm.online shuts down?",
    a: "You keep everything you need to look after them. Every sale was already paid into your own Stripe account, so there's no balance waiting with us. Your viewer list is yours to export at any time, so you can email every buyer directly. And your film stays yours: on Standard it lives on your own Vimeo account, and on Secure we'll send you back every file we host. With those, you can give your buyers access somewhere else.",
  },
  { q: "Can people pirate it?", a: "No streaming site can stop someone determined to record their screen. Standard stops casual sharing: the video won't play anywhere but your page. Secure adds expiring links, which make downloading much harder." },
  { q: "What about sales tax?", a: "You're the seller, so tax registration is yours. Stripe can calculate and collect sales tax and VAT on each sale, and we'll help you switch it on during setup." },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();
  return (
    <section id="faq" className="house" aria-labelledby="faq-title">
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
    <section id="contact" className="screen contact" aria-labelledby="contact-title">
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
