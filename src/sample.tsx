import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { site } from "./config";
import "./styles.css";
import "./sample.css";

/* Sample watch page, recreated from frackingthesystem.com/watch-now. Rent and Buy go to the real film site. */

const FILM_SITE = "https://frackingthesystem.com";
const base = import.meta.env.BASE_URL;

const included = [
  "Full 93-minute documentary",
  "HD streaming quality",
  "Watch on any device",
  "English and Spanish subtitles available",
];

const details: [string, string][] = [
  ["Runtime", "93 minutes"],
  ["Rating", "Not Rated"],
  ["Genre", "Documentary"],
  ["Director", "Brian Hedden"],
  ["Year", "2024"],
];

function Included() {
  return (
    <div className="s-included">
      <h4>What's included</h4>
      <ul>
        {included.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function Sample() {
  return (
    <div className="sample">
      <div className="sample-bar">
        <span>
          Sample watch page built with <a href={base}>{site.name}</a>
        </span>
        <a href={`${base}signup/`} className="btn btn-small">
          Get started
        </a>
      </div>

      <section className="s-hero" style={{ backgroundImage: `url(${base}sample/fts-bg.jpg)` }}>
        <div className="s-wrap">
          <h1>Fracking the System: Colorado's Oil and Gas Wars</h1>
          <p>Watch Now</p>
        </div>
      </section>

      <main className="s-wrap s-main">
        <div className="s-buy">
          <img src={`${base}sample/fts-poster.jpg`} alt="Fracking the System poster" className="s-poster" />

          <div className="s-card">
            <h3>Rent for $4.99</h3>
            <p className="s-sub">30 days to start watching</p>
            <div className="s-box">
              <p className="s-box-title">Viewing period</p>
              <p>Start watching within 30 days</p>
              <p>72 hours to finish once started</p>
            </div>
            <a className="s-btn" href={`${FILM_SITE}/rent-now`} target="_blank" rel="noopener">
              ▶ Rent Now
            </a>
            <p className="s-fine">Secure payment powered by Stripe</p>
            <p className="s-fine">
              <em>For personal viewing only, not for public screenings.</em>
            </p>
            <Included />
          </div>

          <div className="s-card">
            <h3>Buy for $14.99</h3>
            <p className="s-sub">Lifetime access via this website</p>
            <div className="s-box">
              <ul className="s-checks">
                <li>Unlimited access to Fracking the System</li>
                <li>Bonus features: live Q&amp;A recordings with director Brian Hedden and activists from the film</li>
              </ul>
            </div>
            <a className="s-btn" href={`${FILM_SITE}/buy-now`} target="_blank" rel="noopener">
              Buy Now
            </a>
            <p className="s-fine">Secure payment powered by Stripe</p>
            <p className="s-fine">
              <em>For personal viewing only, not for public screenings.</em>
            </p>
            <Included />
          </div>
        </div>

        <div className="s-narrow">
          <h2>Watch the trailer</h2>
          <div className="s-video">
            <iframe
              src="https://www.youtube-nocookie.com/embed/T-azhfhG0H0"
              title="Fracking the System trailer"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>

          <h2>About</h2>
          <p>
            Fracking the System is an inspiring, investigative documentary about climate justice activism in Colorado
            and the nefarious tactics of the oil and gas industry to undermine democracy, from leveraging environmental
            racism to racketeering.
          </p>
          <p>
            When a mega-fracking site gets moved from a White neighborhood to a BIPOC neighborhood, a mother fights to
            try and stop it. She joins the state-wide effort to change the law, but the powerful oil and gas industry
            fights back with lawsuits, harassment, sabotage, and $50 million.
          </p>
          <p>
            The intrepid activists persist and succeed at making lasting, foundational changes to Colorado oil and gas
            law. But is it the end of Colorado's Oil and Gas Wars?
          </p>

          <h3>Film details</h3>
          <dl className="s-details">
            {details.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sample />
  </StrictMode>
);
