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
        <Faq />
        <ContactForm />
      </main>
      <footer className="footer">
        <div className="wrap footer-inner">
          <span className="wordmark">{site.name}</span>
          <span>Independent films direct from the filmmakers</span>
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
  const address = addressType === "sub" ? `${slug}.watchmy.film` : `watch.${slug}.com`;

  const signupUrl = `${import.meta.env.BASE_URL}signup/`;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="house-lights" aria-hidden="true" />
      <p className="wrap tagline">Independent films direct from the filmmakers</p>
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <h1 id="hero-title">Sell your film from your own website.</h1>
          <p className="lede">
            {site.name} builds a paywall on your film's own web address. Viewers rent or buy in
            two clicks, every sale lands in your Stripe account, and the viewer list is yours.
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
                On watchmy.film
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

/* ---------- How it works (a real sequence, so it's numbered) ---------- */

function HowItWorks() {
  const steps = [
    {
      title: "Connect your Stripe account",
      body: "Sales are charged on your own account and paid out to your bank on Stripe's normal schedule. We never hold your money.",
    },
    {
      title: "Add your film",
      body: "Add your poster, trailer and prices. Keep the film on your own Vimeo account, or let us stream it with download-resistant links. On Vimeo, set the video to Hide from Vimeo and allow embedding only on your watch page's address: those privacy settings are what keep it from playing anywhere else. You approve the page before it goes live.",
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
              <li>A list of everyone who watched, ready to export</li>
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
      a: "No. Every film gets an address like yourfilm.watchmy.film. If you already own a domain, we can put the page at watch.yourfilm.com instead.",
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
      q: "What happens to my buyers if watchmy.film shuts down?",
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
            Message sent. We'll get back to you by email.
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
