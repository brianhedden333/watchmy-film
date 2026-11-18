import { useEffect, useId, useState, type FormEvent } from "react";
import { dollars } from "./api";
import type { Film } from "./films";

/* The watch page itself, shared by /preview/ (the filmmaker's and admin's preview) and /watch/ (the live page
   at the film's own address). Styles live in sample.css. */

export // YouTube or Vimeo page link → embeddable player address. Anything else: no player.
function embedUrl(link: string | null) {
  if (!link) return null;
  try {
    const u = new URL(link);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === "youtube.com") {
      const id = u.searchParams.get("v") || u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const [id, hash] = u.pathname.replace(/^\/video\//, "/").split("/").filter(Boolean);
      if (!/^\d+$/.test(id)) return null;
      const h = u.searchParams.get("h") || (hash && /^[0-9a-f]+$/.test(hash) ? hash : "");
      return `https://player.vimeo.com/video/${id}${h ? `?h=${h}` : ""}`;
    }
  } catch {
    /* not a link */
  }
  return null;
}

// What a hidden film's address shows: its look and title, and a short note. No prices, player or trailer.
export function HoldingPage({ film: f, onShowFull }: { film: Film; onShowFull?: () => void }) {
  const hero = f.banner_url || f.still_url;
  return (
    <>
      {onShowFull && (
      <div className="holding-note">
        <span>Your page is hidden, so this holding page is what visitors see.</span>
        <button type="button" className="link-btn" onClick={onShowFull}>
          See the full page
        </button>
      </div>
      )}
      <section className={`s-hero holding ${hero ? "" : "preview-no-still"}`} style={hero ? { backgroundImage: `url(${hero})` } : undefined}>
        <div className="s-wrap">
          <h1>{f.title}</h1>
          <p>Not available right now. Check back soon.</p>
        </div>
      </section>
      <main className="s-wrap s-main holding-main">
        {f.poster_url && <img src={f.poster_url} alt={`${f.title} poster`} className="s-poster holding-poster" />}
        <p>
          Already rented or bought it? You'll be able to watch again as soon as the page is back. Your purchase is saved to
          your email.
        </p>
      </main>
    </>
  );
}

// Pay what you want: Stripe checkout for any amount from the filmmaker's minimum. Unlocks the film.
function PayWhatYouWant({ film: f, days, hours, onWatch, tried, note }: { film: Film; days: number; hours: number; onWatch: () => void; tried: boolean; note: string }) {
  const min = f.pwyw_min_cents / 100;
  const [amount, setAmount] = useState(((f.pwyw_suggested_cents ?? f.pwyw_min_cents) / 100).toFixed(2));
  const [error, setError] = useState("");
  const id = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < min) return setError(`The minimum is ${dollars(f.pwyw_min_cents)}.`);
    setError("");
    onWatch();
  }

  return (
    <form className="s-card s-pwyw" onSubmit={submit}>
      <div className="s-pwyw-text">
        <h3>Pay what you want</h3>
        <p className="s-sub">
          {f.pwyw_access === "buy" ? "Yours to keep, any amount" : `Rent for ${days} days (${hours} hours once started)`} · from{" "}
          {dollars(f.pwyw_min_cents)}
        </p>
      </div>
      <div className="s-pwyw-row">
        <label htmlFor={id} className="visually-hidden">
          Amount in dollars
        </label>
        <span className="s-pwyw-amount">
          <span aria-hidden="true">$</span>
          <input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby={`${id}-n`} />
        </span>
        <button className="s-btn">▶ Watch now</button>
      </div>
      <p id={`${id}-n`} className={error ? "s-fine s-pwyw-err" : "s-fine"} role={error ? "alert" : undefined}>
        {error || (tried ? note : "Secure payment powered by Stripe")}
      </p>
    </form>
  );
}

// Tips straight to the filmmaker (Venmo, PayPal, Zelle). Outside our checkout; unlocks nothing.
function TipJar({ film: f }: { film: Film }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panel = useId();
  return (
    <div className="s-tips">
      <button type="button" className="s-tips-btn" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">♥</span> Support the filmmaker
      </button>
      {open && (
        <div id={panel} className="s-tips-panel">
          <div className="s-tips-links">
            {f.tip_venmo && (
              <a href={`https://venmo.com/u/${encodeURIComponent(f.tip_venmo)}`} target="_blank" rel="noopener">
                Venmo <span>@{f.tip_venmo}</span>
              </a>
            )}
            {f.tip_paypal && (
              <a href={`https://paypal.me/${encodeURIComponent(f.tip_paypal)}`} target="_blank" rel="noopener">
                PayPal <span>paypal.me/{f.tip_paypal}</span>
              </a>
            )}
            {f.tip_zelle && (
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(f.tip_zelle!).then(() => setCopied(true), () => {})}
              >
                Zelle <span>{copied ? "Copied" : f.tip_zelle}</span>
              </button>
            )}
          </div>
          <p className="s-fine">
            Tips go straight to the filmmaker and don't unlock the film.{f.tip_zelle ? " For Zelle, send from your bank's app." : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// mode "preview": the filmmaker's or admin's preview (placeholders for missing parts; admins can open the screening room).
// mode "public": the live page at the film's address. Checkout isn't open yet, so Rent/Buy explain that.
export function WatchPage({ film: f, canWatch = false, mode = "preview" }: { film: Film; canWatch?: boolean; mode?: "preview" | "public" }) {
  const preview = mode === "preview";
  const note = preview ? "Preview only: on your live page this opens checkout." : "Online checkout is opening soon. Check back shortly.";
  const [tried, setTried] = useState("");
  // Admins skip checkout: Rent/Buy opens the screening room a renter or buyer would get.
  const [watching, setWatching] = useState<"rent" | "buy" | null>(null);
  const open = (kind: "rent" | "buy") => {
    setWatching(kind);
    requestAnimationFrame(() => document.querySelector(".s-main")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const rent = f.rent_price_cents;
  const buy = f.buy_price_cents;
  const days = f.rental_days ?? 30;
  const hours = f.rental_hours ?? 72;
  const trailer = embedUrl(f.trailer_url);
  const hero = f.banner_url || f.still_url; // banner across the top; the wide image if there's no banner
  const credits = f.credits.filter((c) => c.names.length);
  const paragraphs = (f.synopsis || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  const included = [
    f.runtime_minutes ? `Full ${f.runtime_minutes}-minute film` : "The full film",
    "HD streaming quality",
    "Watch on any device",
    ...(f.languages ? [`Languages: ${f.languages}`] : []),
  ];
  const details: [string, string][] = (
    [
      ["Runtime", f.runtime_minutes ? `${f.runtime_minutes} minutes` : ""],
      ["Genre", f.genre || ""],
      ["Director", credits.length ? "" : f.director || ""], // already listed under Credits
      ["Year", f.year ? String(f.year) : ""],
      ["Languages", f.languages || ""],
    ] as [string, string][]
  ).filter(([, v]) => v);

  const offers = (rent ? 1 : 0) + (buy ? 1 : 0);
  const hasTips = !!(f.tip_venmo || f.tip_paypal || f.tip_zelle);
  const extras = f.pwyw_enabled || hasTips;
  // The filmmaker's own line for each box; if they left it blank but added videos, list the titles.
  const bonusLine = (k: "rent" | "buy") => {
    const b = f.bonus[k];
    if (b.description.trim()) return b.description.trim();
    return b.videos.length ? `Bonus features: ${b.videos.map((v) => v.title).join(", ")}` : "";
  };
  const rentBonus = bonusLine("rent");
  const buyBonus = bonusLine("buy");
  const buyBtn = (label: string, kind: "rent" | "buy") => (
    <>
      <button type="button" className="s-btn" onClick={() => (canWatch ? open(kind) : setTried(label))}>
        {label}
      </button>
      {tried === label && (
        <p className="s-fine preview-note" role="status">
          {note}
        </p>
      )}
      <p className="s-fine">Secure payment powered by Stripe</p>
      <p className="s-fine">
        <em>For personal viewing only, not for public screenings.</em>
      </p>
      <div className="s-included">
        <h4>What's included</h4>
        <ul>
          {included.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </>
  );

  return (
    <>
      <section
        className={`s-hero ${hero ? "" : "preview-no-still"}`}
        style={hero ? { backgroundImage: `url(${hero})` } : undefined}
      >
        <div className="s-wrap">
          <h1>{f.title}</h1>
          <p>{f.logline || "Watch Now"}</p>
        </div>
      </section>

      <main className="s-wrap s-main">
        {watching ? (
          <ScreeningRoom film={f} kind={watching} days={days} hours={hours} onSwitch={setWatching} onClose={() => setWatching(null)} />
        ) : (
        <div className={`s-buy offers-${offers}${extras ? " has-extras" : ""}`}>
          {f.poster_url ? (
            <img src={f.poster_url} alt={`${f.title} poster`} className="s-poster" />
          ) : (
            preview && <div className="s-poster preview-missing">Your poster goes here</div>
          )}

          {rent != null && (
            <div className="s-card">
              <h3>Rent for {dollars(rent)}</h3>
              <p className="s-sub">{days} days to start watching</p>
              <div className="s-box">
                <p className="s-box-title">Viewing period</p>
                <p>Start watching within {days} days</p>
                <p>{hours} hours to finish once started</p>
              </div>
              {rentBonus && (
                <div className="s-box">
                  <ul className="s-checks">
                    <li>{rentBonus}</li>
                  </ul>
                </div>
              )}
              {buyBtn("▶ Rent Now", "rent")}
            </div>
          )}

          {buy != null && (
            <div className="s-card">
              <h3>Buy for {dollars(buy)}</h3>
              <p className="s-sub">Lifetime access via this website</p>
              <div className="s-box">
                <ul className="s-checks">
                  <li>Unlimited access to {f.title}</li>
                  {buyBonus && <li>{buyBonus}</li>}
                </ul>
              </div>
              {buyBtn("Buy Now", "buy")}
            </div>
          )}

          {preview && offers === 0 && !f.pwyw_enabled && (
            <div className="s-card preview-missing">Add a rent or buy price and your offers appear here.</div>
          )}

          {extras && (
            <div className="s-extras">
              {f.pwyw_enabled && (
                <PayWhatYouWant
                  film={f}
                  days={days}
                  hours={hours}
                  onWatch={() => (canWatch ? open(f.pwyw_access) : setTried("pwyw"))}
                  tried={tried === "pwyw"}
                  note={note}
                />
              )}
              {hasTips && <TipJar film={f} />}
            </div>
          )}
        </div>
        )}

        <div className="s-narrow">
          {trailer && <h2>Watch the trailer</h2>}
          {trailer && (
            <div className="s-video">
              <iframe src={trailer} title={`${f.title} trailer`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
            </div>
          )}

          {(preview || paragraphs.length > 0) && <h2>About</h2>}
          {paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : preview && <p className="preview-missing-text">Your synopsis goes here.</p>}

          {details.length > 0 && (
            <>
              <h3>Film details</h3>
              <dl className="s-details">
                {details.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {credits.length > 0 && (
            <>
              <h3>Credits</h3>
              <dl className="s-details">
                {credits.map((c) => (
                  <div key={c.role}>
                    <dt>{c.role}</dt>
                    <dd>{c.names.join(", ")}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </main>
    </>
  );
}

// What a viewer gets after paying: the film in a large player where the poster and price boxes were,
// their access terms, and the bonus features for what they bought, playable in the same player.
function ScreeningRoom({ film: f, kind, days, hours, onSwitch, onClose }: {
  film: Film; kind: "rent" | "buy"; days: number; hours: number; onSwitch: (k: "rent" | "buy") => void; onClose: () => void;
}) {
  const items = [{ title: "The film", url: f.vimeo_url || "" }, ...f.bonus[kind].videos];
  const [playing, setPlaying] = useState(0);
  useEffect(() => setPlaying(0), [kind]);
  const current = items[playing];
  const src = embedUrl(current.url);
  const both = f.rent_price_cents != null && f.buy_price_cents != null;

  return (
    <section className="s-screen" aria-label={`Watching ${f.title}`}>
      <div className="s-screen-admin">
        <span>Admin view: what a {kind === "rent" ? "renter" : "buyer"} sees after paying.</span>
        {both && (
          <button type="button" className="link-btn" onClick={() => onSwitch(kind === "rent" ? "buy" : "rent")}>
            Show the {kind === "rent" ? "buyer" : "renter"} view
          </button>
        )}
        <button type="button" className="link-btn" onClick={onClose}>
          Back to Rent and Buy
        </button>
      </div>

      <div className="s-player">
        {src ? (
          <iframe key={src} src={src} title={`${f.title}: ${current.title}`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        ) : (
          <p className="s-player-missing">
            {current.url ? `This link can't be played here: ${current.url}` : "No Vimeo link for the film yet."}
          </p>
        )}
      </div>

      <div className="s-screen-info">
        <div>
          <p className="s-now">
            Now playing: <strong>{playing === 0 ? f.title : current.title}</strong>
          </p>
          <p className="s-access">
            {kind === "rent"
              ? `Rented. Start within ${days} days, then you have ${hours} hours to finish.`
              : "Yours to keep. Watch any time on this website."}{" "}
            On another device? Sign in with the email you paid with.
          </p>
        </div>
      </div>

      {items.length > 1 && (
        <div className="s-playlist">
          <h3>{kind === "rent" ? "Included with your rental" : "Bonus features"}</h3>
          <ol>
            {items.map((it, i) => (
              <li key={i}>
                <button type="button" aria-current={i === playing ? "true" : undefined} onClick={() => setPlaying(i)}>
                  <span className="s-playlist-num" aria-hidden="true">{i === playing ? "▶" : i + 1}</span>
                  {it.title}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
