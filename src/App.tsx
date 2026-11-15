import { useId, useMemo, useState, type FormEvent } from "react";
import { money, pricing, site, splitSale, type TierKey } from "./config";
import { WatchPreview, slugify } from "./WatchPreview";

export default function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <SampleStrip />
        <HowItWorks />
        <WhatYouGet />
        <Pricing />
        <Story />
        <Compare />
        <Faq />
        <ContactForm />
      </main>
      <footer className="footer">
        <div className="wrap footer-inner">
          <span className="wordmark">{site.name}</span>
          <span>Fully customizable paywall for independent films</span>
        </div>
      </footer>
    </>
  );
}

function Header() {
  return (
    <header className="header">
      <div className="wrap header-inner">
        <a href="#main" className="wordmark" aria-label={`${site.name} home`}>
          {site.name}
        </a>
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#about">About us</a>
          <a href="#faq">Questions</a>
          {site.accountsOpen && <a href={`${import.meta.env.BASE_URL}signin/`}>Sign in</a>}
          <a href={`${import.meta.env.BASE_URL}signup/`} className="btn btn-small">
            Get started
          </a>
        </nav>
      </div>
    </header>
  );
}

/* ---------- Hero: live preview of the filmmaker's own watch page ---------- */

function Hero() {
  const [title, setTitle] = useState("Saltwater Hymns");
  const [addressType, setAddressType] = useState<"sub" | "own">("sub");
  const inputId = useId();

  const slug = slugify(title);
  const address = addressType === "sub" ? `${slug}.watchmyfilm.online` : `watch.${slug}.com`;

  const signupUrl = `${import.meta.env.BASE_URL}signup/`;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="house-lights" aria-hidden="true" />
      <p className="wrap tagline">Fully customizable paywall for independent films</p>
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <h1 id="hero-title">Sell your film from your own website.</h1>
          <p className="lede">
            {site.name} builds a paywall on your film's own web address. Viewers rent or buy in
            two clicks, no sign-up needed. Every sale lands in your Stripe account, and the viewer list is yours.
          </p>

          <ul className="hero-points">
            <li>No monthly fee</li>
            <li>No exclusivity</li>
            <li>Custom domain</li>
          </ul>

          <div className="try">
            <label htmlFor={inputId}>Type your film's title to get started</label>
            <div className="try-row">
              <input
                id={inputId}
                value={title}
                maxLength={60}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && window.location.assign(signupUrl)}
                autoComplete="off"
                spellCheck={false}
              />
              <a href={signupUrl} className="btn">
                Get started
              </a>
            </div>
            <fieldset className="address-choice">
              <legend>Web address</legend>
              <label>
                <input
                  type="radio"
                  name="address"
                  checked={addressType === "sub"}
                  onChange={() => setAddressType("sub")}
                />
                On watchmyfilm.online
              </label>
              <label>
                <input
                  type="radio"
                  name="address"
                  checked={addressType === "own"}
                  onChange={() => setAddressType("own")}
                />
                On your own domain
              </label>
            </fieldset>
          </div>
        </div>

        <WatchPreview title={title} address={address} />
      </div>
    </section>
  );
}

/* ---------- Sample: a real watch page ---------- */

function SampleStrip() {
  return (
    <section className="sample-strip" aria-labelledby="sample-title">
      <div className="wrap sample-strip-inner">
        <h2 id="sample-title">See a sample</h2>
        <a href={`${import.meta.env.BASE_URL}sample/`} className="sample-shot">
          <img
            src={`${import.meta.env.BASE_URL}sample/fts-watch-screenshot.jpg`}
            alt="Fracking the System's watch page: the film poster beside Rent for $4.99 and Buy for $14.99 options"
            width={1600}
            height={834}
            loading="lazy"
          />
        </a>
      </div>
    </section>
  );
}

/* ---------- Story: why this exists ---------- */

function Story() {
  return (
    <section id="about" className="band story" aria-labelledby="story-title">
      <div className="wrap story-grid">
        <h2 id="story-title">By filmmakers, for filmmakers</h2>
        <div className="story-body">
          <p>
            When I finished my documentary <em>Fracking the System</em>, I tried the usual routes for independent
            films, like Vimeo On Demand and Gathr. None of them gave me the control I wanted over how my film was
            presented, priced and shared, or a direct line to the people who watched it.
          </p>
          <p className="story-close">
            So I built my own watch page at{" "}
            <a href="https://frackingthesystem.com" target="_blank" rel="noopener">
              frackingthesystem.com
            </a>
            . {site.name} is that same setup for other filmmakers: the best viewing experience for your audience, and
            as much of each sale as possible back in your pocket.
          </p>
          <ul className="story-points">
            <li>
              <h3>No exclusivity</h3>
              <p>
                You stay in control of your film's rights. We're software, not a distributor: our job is to give your
                audience the best possible way to watch.
              </p>
            </li>
            <li>
              <h3>Your viewer list comes with you</h3>
              <p>Connect directly with your audience after they watch your film.</p>
            </li>
            <li>
              <h3>Transparency</h3>
              <p>A live dashboard shows you how your film is doing.</p>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- How we compare ----------
   Checked against each company's own pricing page (Eventive also from its help center) on Nov 14, 2026.
   Recheck before changing: competitors change prices often. */

type Rival = { name: string; plan?: string; builtFor: string; fees: string[]; rental: string; setup: string; us?: boolean };

const rivals: Rival[] = [
  {
    name: site.name,
    builtFor: "Selling your film from its own website",
    fees: ["$249 one-time setup", "No monthly fee", "8%–10% platform fee per sale"],
    rental: "$0.50–$0.75",
    setup: "Done for you",
    us: true,
  },
  {
    name: "Eventive",
    plan: "Virtual Single Film",
    builtFor: "Festival-style virtual screenings",
    fees: ["$299 one-time", "2.1% + 69¢–99¢ ticketing fee per sale", "99¢ streaming fee per viewer after the first 100"],
    rental: "$0.82–$1.81",
    setup: "Self-serve",
  },
  {
    name: "MediaZilla",
    plan: "Growth",
    builtFor: "Video storefronts",
    fees: ["$37 monthly, billed annually ($444 a year)", "0% per sale"],
    rental: "$0",
    setup: "Self-serve",
  },
  {
    name: "Uscreen",
    plan: "Starter",
    builtFor: "Video memberships",
    fees: ["$49 monthly", "10% per sale"],
    rental: "$0.60",
    setup: "Self-serve",
  },
  {
    name: "Vimeo OTT",
    plan: "Starter",
    builtFor: "Subscription channels",
    fees: ["$1 monthly per subscriber", "10% per sale"],
    rental: "$0.60",
    setup: "Self-serve",
  },
  {
    name: "Dacast",
    plan: "Event",
    builtFor: "Live events",
    fees: ["$63 monthly, billed annually ($756 a year)", "9.9% + 40¢ per sale, card processing included"],
    rental: "$0.99*",
    setup: "Self-serve",
  },
  {
    name: "Vodlix",
    plan: "Launch",
    builtFor: "Streaming services",
    fees: ["$99 monthly, or $990 annually", "0% per sale"],
    rental: "$0",
    setup: "Self-serve",
  },
  {
    name: "Gumroad",
    builtFor: "Digital downloads",
    fees: ["No monthly fee", "10% + 50¢ per sale"],
    rental: "$1.10",
    setup: "Self-serve",
  },
  {
    name: "Payhip",
    plan: "Free Forever",
    builtFor: "Downloads and courses",
    fees: ["No monthly fee", "5% per sale"],
    rental: "$0.30",
    setup: "Self-serve",
  },
];

function Compare() {
  return (
    <section id="compare" className="band compare" aria-labelledby="compare-title">
      <div className="wrap">
        <h2 id="compare-title">How we compare</h2>
        <p className="lede compare-lede">
          What it costs to sell a film on each platform, from their own pricing pages.
        </p>

        <div className="compare-scroll" role="region" aria-labelledby="compare-title" tabIndex={0}>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Platform</th>
                <th scope="col">Built for</th>
                <th scope="col">Fees</th>
                <th scope="col">Platform fee on a $5.99 rental</th>
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
                  <td className="compare-num">{r.rental}</td>
                  <td>{r.setup}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="compare-note">
          Prices checked November 2026 and can change. Card processing (about 2.9% + 30¢ per sale through Stripe) is
          extra on every platform except where marked *. Our platform fee has a minimum of 50¢ (Standard) or 75¢
          (Secure) per sale.
        </p>
      </div>
    </section>
  );
}

/* ---------- How it works (a real sequence, so it's numbered) ---------- */

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
    <section id="how" className="band light" aria-labelledby="how-title">
      <div className="wrap">
        <h2 id="how-title">From finished film to first sale</h2>
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- What viewers get / what you keep ---------- */

function WhatYouGet() {
  return (
    <section className="band light tight" aria-labelledby="get-title">
      <div className="wrap">
        <h2 id="get-title" className="visually-hidden">
          What viewers get and what you keep
        </h2>
        <div className="two-col">
          <div>
            <h3>Your viewers</h3>
            <ul className="ticks">
              <li>Rent or buy without creating a password; they sign in with a link sent to their email</li>
              <li>Pay by card, Apple Pay or Google Pay</li>
              <li>Watch on a phone or laptop, or cast to a TV</li>
              <li>Turn on captions in the player</li>
            </ul>
          </div>
          <div>
            <h3>You</h3>
            <ul className="ticks">
              <li>Every sale goes to your own Stripe account</li>
              <li>Get a list of everyone who watched, ready to export</li>
              <li>Your prices, your rental window, promo codes and free press screeners</li>
              <li>No exclusivity. Sell on any other platform too</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Pricing: where each dollar of a sale goes ---------- */

function Pricing() {
  const [price, setPrice] = useState(5.99);
  const [tier, setTier] = useState<TierKey>("standard");
  const split = useMemo(() => splitSale(price, tier), [price, tier]);
  const pct = (n: number) => `${((n / price) * 100).toFixed(1)}%`;
  const { standard, secure } = pricing.tiers;

  return (
    <section id="pricing" className="band dark" aria-labelledby="pricing-title">
      <div className="wrap">
        <h2 id="pricing-title">No monthly fee. We earn when you sell.</h2>

        <div className="splitter">
          <div className="controls">
            <div className="seg" role="radiogroup" aria-label="Ticket price">
              {pricing.examplePrices.map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={price === p}
                  className={price === p ? "on" : ""}
                  onClick={() => setPrice(p)}
                >
                  {money(p)}
                </button>
              ))}
            </div>
            <div className="seg" role="radiogroup" aria-label="Plan">
              {(["standard", "secure"] as TierKey[]).map((k) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={tier === k}
                  className={tier === k ? "on" : ""}
                  onClick={() => setTier(k)}
                >
                  {k === "standard" ? "Standard" : "Secure"}
                </button>
              ))}
            </div>
          </div>

          <div className="bar" aria-hidden="true">
            <span className="seg-you" style={{ flexGrow: split.filmmaker }} />
            <span className="seg-us" style={{ flexGrow: split.fee }} />
            <span className="seg-stripe" style={{ flexGrow: split.stripe }} />
          </div>
          <dl className="split-legend" aria-live="polite">
            <div className="you">
              <dt>You keep</dt>
              <dd>
                {money(split.filmmaker)} <small>{pct(split.filmmaker)}</small>
              </dd>
            </div>
            <div className="us">
              <dt>{site.name}</dt>
              <dd>
                {money(split.fee)} <small>{pct(split.fee)}</small>
              </dd>
            </div>
            <div className="stripe">
              <dt>Stripe card fee</dt>
              <dd>
                {money(split.stripe)} <small>{pct(split.stripe)}</small>
              </dd>
            </div>
          </dl>
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
              We host and stream the film with links that expire after each viewing session, which
              makes it much harder to download. Streaming costs are included. Choose this if a
              distributor or festival requires it.
            </p>
          </div>
        </div>

        <ul className="fine">
          <li>
            Setup is {money(pricing.setupFee).replace(".00", "")} once: your page, Stripe connection
            and a test purchase together.
          </li>
          <li>Stripe's card fee is 2.9% + 30¢ per sale on any plan.</li>
        </ul>
      </div>
    </section>
  );
}

/* ---------- Questions ---------- */

function Faq() {
  const items = [
    {
      q: "Do I need my own domain?",
      a: "No. Every film gets an address like yourfilm.watchmyfilm.online. If you already own a domain, we can put the page at watch.yourfilm.com instead.",
    },
    {
      q: "Who actually receives the money?",
      a: "You do. Each sale is charged on your own Stripe account, our fee is deducted automatically, and Stripe pays the rest out to your bank.",
    },
    {
      q: "Can I keep selling on other platforms?",
      a: "Yes. There's no exclusivity, and you can leave whenever you want. Your viewer list comes with you.",
    },
    {
      q: "What happens to my buyers if watchmyfilm.online shuts down?",
      a: "You keep everything you need to look after them. Every sale was already paid into your own Stripe account, so there's no balance waiting with us. Your viewer list is yours to export at any time, so you can email every buyer directly. And your film stays yours: on Standard it lives on your own Vimeo account, and on Secure we'll send you back every file we host. With those, you can give your buyers access somewhere else.",
    },
    {
      q: "Can people pirate it?",
      a: "No streaming site can stop someone determined to record their screen. Standard stops casual sharing: the video won't play anywhere but your page. Secure adds expiring links, which make downloading much harder.",
    },
    {
      q: "What about sales tax?",
      a: "You're the seller, so tax registration is yours. Stripe can calculate and collect sales tax and VAT on each sale, and we'll help you switch it on during setup.",
    },
  ];
  return (
    <section id="faq" className="band light" aria-labelledby="faq-title">
      <div className="wrap narrow">
        <h2 id="faq-title">Questions filmmakers ask</h2>
        <div className="faq">
          {items.map((i) => (
            <details key={i.q}>
              <summary>{i.q}</summary>
              <p>{i.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Contact form ---------- */

type Status = "idle" | "sending" | "sent" | "error" | "unconfigured";

function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!site.formEndpoint) {
      setStatus("unconfigured");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch(site.formEndpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(e.currentTarget),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id="contact" className="band dark closing" aria-labelledby="contact-title">
      <div className="wrap narrow">
        <h2 id="contact-title">Have questions? Reach out to us</h2>
        <p className="lede">
          Ask us anything about selling your film. We'll get back to you by email.
        </p>

        {status === "sent" ? (
          <p className="form-msg ok" role="status">
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
            {/* Honeypot: hidden from people, bots tend to fill it in */}
            <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
            <div className="full form-foot">
              <button type="submit" className="btn" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send message"}
              </button>
              {status === "error" && (
                <p className="form-msg err" role="alert">
                  Your message didn't go through. Check your connection and send it again.
                </p>
              )}
              {status === "unconfigured" && (
                <p className="form-msg err" role="alert">
                  This form isn't connected yet. Set formEndpoint in src/config.ts.
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
