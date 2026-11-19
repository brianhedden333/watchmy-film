import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { pricing, site } from "./config";
import "./styles.css";
import "./workflow.css";

/* Internal setup checklist. Not linked from the landing page. */

type Who = "You" | "Filmmaker" | "Both";
type Item = { id: string; task: string; who: Who; note?: string };
type Phase = { title: string; items: Item[] };

const phases: Phase[] = [
  {
    title: "Intake and agreement",
    items: [
      { id: "intake", who: "Both", task: "Intake call", note: "Title, runtime, release date, prices, rental window, existing domain, festival or distributor restrictions, territories they hold rights in." },
      { id: "rights", who: "Filmmaker", task: "Confirm rights", note: "They own distribution rights in the territories they'll sell to, music is licensed for streaming, and content fits Stripe's acceptable-use rules." },
      { id: "tier", who: "Both", task: "Choose plan and address", note: "One plan for now (8%): the film plays from their private Vimeo or unlisted YouTube link. Secure (Mux) is paused. Address: film.watchmyfilm.online or watch.theirdomain.com." },
      { id: "agreement", who: "You", task: "Send filmmaker agreement", note: "Fees, payout terms, rights warranty, refund policy, 60 days' notice before fee changes, no exclusivity." },
      { id: "setup-fee", who: "You", task: "Setup fee: $0 to start", note: `Nothing to invoice. We recover the $${pricing.setupFee} setup cost by adding $${pricing.setupSurcharge} to our fee on each sale until it's covered. Don't start work until the agreement is signed.` },
    ],
  },
  {
    title: "Payments",
    items: [
      { id: "connect", who: "Filmmaker", task: "Connect Stripe account", note: "Send them your Connect onboarding link. They verify identity and add a bank account." },
      { id: "connect-check", who: "You", task: "Confirm the account can take payments", note: "In your Connect dashboard: charges enabled and payouts enabled are both on." },
      { id: "descriptor", who: "Filmmaker", task: "Set statement descriptor and receipt branding", note: "So the charge shows the film's name on bank statements instead of something viewers dispute." },
      { id: "methods", who: "Filmmaker", task: "Turn on payment methods", note: "Apple Pay, Google Pay, Link; Cash App Pay optional." },
      { id: "apple-domain", who: "You", task: "Register the watch page domain for Apple Pay", note: "Payment method domains must be registered on their connected account, or Apple Pay won't show." },
      { id: "tax", who: "Filmmaker", task: "Decide on Stripe Tax", note: "Their decision as the seller. Walk them through turning it on if they want sales tax and VAT collected." },
    ],
  },
  {
    title: "Video",
    items: [
      { id: "master", who: "Filmmaker", task: "Deliver files", note: "Feature master, trailer, and captions (.vtt or .srt). Secure plan: a high-bitrate master by file transfer." },
      { id: "vimeo", who: "Filmmaker", task: "Set up Vimeo (or YouTube)", note: "YouTube: Unlisted, embedding on (less protected: the link plays anywhere). Vimeo: paid plan. Privacy: hide from Vimeo, embed only on the watch page domain, downloads off, captions uploaded. Send you the video ID." },
      { id: "mux", who: "You", task: "Secure: upload to Mux (paused)", note: "Signed playback policy, captions attached, poster frame chosen. Store the playback ID." },
      { id: "lockdown", who: "You", task: "Test that the film is locked down", note: "Player URL opened directly and embedded on another site should both be blocked. Only the watch page plays it." },
      { id: "trailer", who: "You", task: "Set up the trailer as public", note: "Plays for anyone, no purchase needed." },
    ],
  },
  {
    title: "Watch page",
    items: [
      { id: "assets", who: "Filmmaker", task: "Send page assets", note: "Poster (2:3) and wide key art (16:9), logline, synopsis, credits, laurels, press quotes." },
      { id: "record", who: "You", task: "Create the film record", note: "Slug, prices, rental window, plan, video IDs, connected account ID, territories, on-sale date." },
      { id: "domain", who: "Both", task: "Set up the address", note: "Subdomain: automatic. Own domain: they add a CNAME for watch.theirdomain.com; you add the custom hostname and wait for the certificate." },
      { id: "email", who: "You", task: "Check outgoing email", note: "Sending domain is authenticated in SendGrid (DKIM). Sender name like “Film Title via watchmyfilm.online”, reply-to set to the support inbox." },
      { id: "preview", who: "Filmmaker", task: "Approve the preview", note: "Send the preview link; they sign off on copy, images, prices." },
    ],
  },
  {
    title: "Testing",
    items: [
      { id: "test-mode", who: "You", task: "Run the full flow in Stripe test mode", note: "Rent, buy, declined card, sign-in link, playback on phone and laptop, cast to TV, rental expiry, refund." },
      { id: "live-test", who: "You", task: "Make one real purchase", note: "Use a real card, confirm your fee lands in your platform balance and the rest in theirs, then refund it." },
      { id: "emails", who: "You", task: "Check the emails arrive", note: "Receipt and sign-in emails reach Gmail and Outlook inboxes, not spam." },
    ],
  },
  {
    title: "Launch",
    items: [
      { id: "go-live", who: "You", task: "Switch the page on sale", note: "Set the on-sale date or flip it live." },
      { id: "button", who: "Filmmaker", task: "Add the Watch now button", note: "Link from their site, newsletter, social bios and trailer descriptions." },
      { id: "codes", who: "You", task: "Create promo codes and press screeners", note: "Launch discount if they want one; free screener links for press and festivals." },
      { id: "watch-day", who: "You", task: "Watch launch day", note: "Error logs, Stripe dashboard, support inbox. Fix anything blocking purchases first." },
    ],
  },
  {
    title: "After launch",
    items: [
      { id: "first-month", who: "Both", task: "One-month check-in", note: "Sales, viewer questions, price or window changes." },
      { id: "disputes", who: "You", task: "Watch for disputes and refunds", note: "Respond to disputes before the deadline; refunds follow their policy." },
      { id: "export", who: "You", task: "Send the viewer list", note: "Export on request, and whenever they ask to leave." },
      { id: "renewals", who: "Filmmaker", task: "Keep the Vimeo plan paid", note: "Standard plan only. A lapsed plan breaks playback for everyone." },
    ],
  },
];

const allIds = phases.flatMap((p) => p.items.map((i) => i.id));
const STORE = "watchfilm-checklists";

type Saved = Record<string, string[]>;

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}

function save(data: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch {
    /* storage unavailable: checklist still works for this visit */
  }
}

function Workflow() {
  const [saved, setSaved] = useState<Saved>(load);
  const [film, setFilm] = useState<string>(() => Object.keys(load())[0] ?? "");
  const [newFilm, setNewFilm] = useState("");

  useEffect(() => save(saved), [saved]);

  const films = Object.keys(saved);
  const done = useMemo(() => new Set(film ? saved[film] ?? [] : []), [saved, film]);

  function toggle(id: string) {
    if (!film) return;
    setSaved((s) => {
      const cur = new Set(s[film] ?? []);
      cur.has(id) ? cur.delete(id) : cur.add(id);
      return { ...s, [film]: [...cur] };
    });
  }

  function addFilm(e: React.FormEvent) {
    e.preventDefault();
    const name = newFilm.trim();
    if (!name) return;
    setSaved((s) => (s[name] ? s : { ...s, [name]: [] }));
    setFilm(name);
    setNewFilm("");
  }

  function removeFilm() {
    if (!film || !confirm(`Remove the checklist for “${film}”? Its progress can't be recovered.`)) return;
    setSaved((s) => {
      const { [film]: _removed, ...rest } = s;
      void _removed;
      return rest;
    });
    setFilm(films.find((f) => f !== film) ?? "");
  }

  return (
    <div className="wf">
      <header className="wf-head">
        <div className="wrap">
          <a href={import.meta.env.BASE_URL} className="wordmark">
            {site.name}
          </a>
          <h1>Setup checklist</h1>
          <p>
            Every step from first call to after launch. Progress saves in this browser, one checklist per
            film.
          </p>

          <div className="wf-films">
            {films.length > 0 && (
              <label>
                Film
                <select value={film} onChange={(e) => setFilm(e.target.value)}>
                  {films.map((f) => (
                    <option key={f} value={f}>
                      {f} ({(saved[f] ?? []).length}/{allIds.length})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <form onSubmit={addFilm}>
              <label>
                {films.length ? "Start another film" : "Start a checklist for a film"}
                <span className="wf-add">
                  <input value={newFilm} onChange={(e) => setNewFilm(e.target.value)} placeholder="Film title" />
                  <button className="btn btn-small" type="submit">
                    Start checklist
                  </button>
                </span>
              </label>
            </form>
          </div>

          {film && (
            <div className="wf-progress">
              <div className="wf-meter" aria-hidden="true">
                <span style={{ width: `${(done.size / allIds.length) * 100}%` }} />
              </div>
              <p>
                {done.size} of {allIds.length} done for <strong>{film}</strong>
                <button className="wf-link" onClick={removeFilm}>
                  Remove this checklist
                </button>
              </p>
            </div>
          )}
        </div>
      </header>

      <main className="wrap wf-body">
        {!film && <p className="wf-empty">Start a checklist above to tick off steps.</p>}
        <ol className="wf-phases">
          {phases.map((p) => {
            const n = p.items.filter((i) => done.has(i.id)).length;
            return (
              <li key={p.title}>
                <h2>
                  {p.title}
                  <span className="wf-count">
                    {n}/{p.items.length}
                  </span>
                </h2>
                <ul>
                  {p.items.map((i) => (
                    <li key={i.id} className={done.has(i.id) ? "is-done" : ""}>
                      <label>
                        <input type="checkbox" checked={done.has(i.id)} disabled={!film} onChange={() => toggle(i.id)} />
                        <span className="wf-task">
                          <span className="wf-title">
                            {i.task}
                            <span className={`wf-who who-${i.who.toLowerCase()}`}>{i.who}</span>
                          </span>
                          {i.note && <span className="wf-note">{i.note}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Workflow />
  </StrictMode>
);
