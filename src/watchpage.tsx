import { useEffect, useId, useState, type FormEvent } from "react";
import { api, dollars } from "./api";
import type { Film } from "./films";

// What a viewer has bought on the live page (from /api/watch/access, /claim or /signin/verify).
type Access = {
  access: "rent" | "buy" | null;
  vimeo_url?: string | null;
  bonus?: { title: string; url: string }[];
  started?: boolean;
  start_by?: string | null;
  ends_at?: string | null;
  signedIn?: boolean;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Time left on a started rental: "2 days 5 hours", "5 hours 12 minutes", "12 minutes".
function timeLeft(iso: string) {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d) return h ? `${plural(d, "day")} ${plural(h, "hour")}` : plural(d, "day");
  if (h) return m ? `${plural(h, "hour")} ${plural(m, "minute")}` : plural(h, "hour");
  return plural(Math.max(m, 1), "minute");
}

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
function PayWhatYouWant({ film: f, days, finish, onWatch, tried, note, busy }: { film: Film; days: number; finish: string; onWatch: (cents: number) => void; tried: boolean; note: string; busy?: boolean }) {
  const min = f.pwyw_min_cents / 100;
  const [amount, setAmount] = useState(((f.pwyw_suggested_cents ?? f.pwyw_min_cents) / 100).toFixed(2));
  const [error, setError] = useState("");
  const id = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < min) return setError(`The minimum is ${dollars(f.pwyw_min_cents)}.`);
    if (n > 1000) return setError("The most you can pay here is $1,000.");
    setError("");
    onWatch(Math.round(n * 100));
  }

  return (
    <form className="s-card s-pwyw" onSubmit={submit}>
      <div className="s-pwyw-text">
        <h3>Pay what you want</h3>
        <p className="s-sub">
          {f.pwyw_access === "buy" ? "Yours to keep, any amount" : `Rent for ${days} days (${finish} once started)`} · from{" "}
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
        <button className="s-btn" disabled={busy}>{busy ? "Opening checkout…" : "▶ Watch now"}</button>
      </div>
      <p id={`${id}-n`} className={error ? "s-fine s-pwyw-err" : "s-fine"} role={error ? "alert" : undefined}>
        {error || (tried ? note : "Secure payment powered by Stripe")}
      </p>
    </form>
  );
}

// Tips straight to the filmmaker (Venmo, PayPal, Zelle). Outside our checkout; unlocks nothing.
function TipJar({ film: f }: { film: Film }) {
  const [copied, setCopied] = useState(false);
  const heading = useId();
  return (
    <section className="s-tips" aria-labelledby={heading}>
      <h3 id={heading} className="s-tips-title">
        <span aria-hidden="true">♥</span> Support the filmmaker
      </h3>
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
    </section>
  );
}

// mode "preview": the filmmaker's or admin's preview (placeholders for missing parts; admins can open the screening room).
// mode "public": the live page at the film's address. Checkout isn't open yet, so Rent/Buy explain that.
export function WatchPage({ film: f, canWatch = false, mode = "preview" }: { film: Film; canWatch?: boolean; mode?: "preview" | "public" }) {
  const preview = mode === "preview";
  const note = preview ? "Preview only: on your live page this opens checkout." : "Online checkout is opening soon. Check back shortly.";
  const [tried, setTried] = useState("");
  // Admins skip checkout: Rent/Buy opens the screening room a renter or buyer would get.
  const [watching, setWatching] = useState<"rent" | "buy" | "free" | null>(null);
  const open = (kind: "rent" | "buy" | "free") => {
    setWatching(kind);
    requestAnimationFrame(() => document.querySelector(".s-main")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // ----- Live page: buying and watching -----
  const live = mode === "public";
  const [acc, setAcc] = useState<Access | null>(null);
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!live) return;
    const q = new URLSearchParams(location.search);
    const paid = q.get("paid");
    const signin = q.get("signin");
    if (paid || signin) history.replaceState(null, "", location.pathname); // don't leave tokens in the address bar
    (async () => {
      try {
        if (paid) {
          const r = await api<Access & { pending?: boolean; signIn?: boolean }>("/watch/claim", { body: { session_id: paid } });
          if (r.pending) setFlash("Thanks! Your payment is still being confirmed. We'll email you a link to watch as soon as it clears.");
          else if (r.signIn) setFlash("Thanks for your purchase! We've emailed you a link to watch on this device.");
          else {
            setAcc(r);
            setFlash("Thanks for your purchase! Enjoy the film.");
          }
        } else if (signin) {
          setAcc(await api<Access>("/watch/signin/verify", { body: { token: signin } }));
        } else {
          setAcc(await api<Access>("/watch/access"));
        }
      } catch (e) {
        setError((e as Error).message);
        if (paid || signin) api<Access>("/watch/access").then(setAcc).catch(() => {});
      }
    })();
  }, [live]);

  async function checkout(kind: "rent" | "buy" | "pwyw", amountCents?: number) {
    setBusy(kind);
    setError("");
    try {
      const r = await api<{ url: string }>("/watch/checkout", { body: { kind, amount_cents: amountCents } });
      location.assign(r.url);
      await new Promise(() => {}); // keep the button busy while the browser leaves for Stripe
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }

  // Open what they bought. A rental's hours start on the first play.
  async function watchBought() {
    if (!acc?.access) return;
    if (acc.access === "rent" && !acc.started) {
      try {
        setAcc(await api<Access>("/watch/start", { body: {} }));
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    open(acc.access);
  }

  // The film as the screening room needs it: on the live page, the links come from the viewer's access.
  const roomFilm: Film =
    live && acc?.access
      ? { ...f, vimeo_url: acc.vimeo_url ?? null, bonus: { ...f.bonus, [acc.access]: { ...f.bonus[acc.access], videos: acc.bonus || [] } } }
      : f;
  const rent = f.rent_price_cents;
  const buy = f.buy_price_cents;
  const days = f.rental_days ?? 30;
  const finish = plural(f.rental_watch_days ?? 3, "day"); // time to finish once a rental is started
  // While a started rental is on screen, refresh the time-left text every minute.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!acc?.started) return;
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [acc?.started]);
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
  const extras = f.free_watch || f.pwyw_enabled || hasTips;
  // The filmmaker's own line for each box; if they left it blank but added videos, list the titles.
  const bonusLine = (k: "rent" | "buy") => {
    const b = f.bonus[k];
    if (b.description.trim()) return b.description.trim();
    return b.videos.length ? `Bonus features: ${b.videos.map((v) => v.title).join(", ")}` : "";
  };
  const rentBonus = bonusLine("rent");
  const buyBonus = bonusLine("buy");
  // Owned covers everything; a rental covers renting again.
  const covers = (kind: "rent" | "buy") => acc?.access === "buy" || acc?.access === kind;
  const onBuy = (label: string, kind: "rent" | "buy") => {
    if (canWatch) return open(kind);
    if (!live) return setTried(label);
    if (covers(kind)) return watchBought();
    checkout(kind);
  };
  const buyBtn = (label: string, kind: "rent" | "buy") => (
    <>
      <button type="button" className="s-btn" onClick={() => onBuy(label, kind)} disabled={busy === kind}>
        {busy === kind ? "Opening checkout…" : live && covers(kind) ? "▶ Watch now" : label}
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
        {live && (flash || error) && (
          <p className={error ? "s-flash s-flash-err" : "s-flash"} role={error ? "alert" : "status"}>
            {error || flash}
          </p>
        )}
        {live && acc?.access && !watching && (
          <div className="s-card s-owned">
            <div>
              <h3>{acc.access === "buy" ? "You own this film" : "You rented this film"}</h3>
              <p className="s-sub">
                {acc.access === "buy"
                  ? "Watch it any time on this page."
                  : acc.started && acc.ends_at
                    ? `${timeLeft(acc.ends_at)} left to watch (your rental ends ${when(acc.ends_at)}).`
                    : `Start by ${acc.start_by ? when(acc.start_by) : "the end of your rental window"}. Once you press play you have ${finish} to finish.`}
              </p>
            </div>
            <button type="button" className="s-btn" onClick={watchBought}>
              ▶ Watch now
            </button>
          </div>
        )}
        {watching ? (
          <ScreeningRoom
            film={canWatch ? f : roomFilm}
            kind={watching}
            admin={canWatch}
            days={days}
            finish={finish}
            endsAt={live ? acc?.ends_at ?? null : null}
            onSwitch={setWatching}
            onClose={() => setWatching(null)}
          />
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
                <p>{finish} to finish once started</p>
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

          {preview && offers === 0 && !f.pwyw_enabled && !f.free_watch && !hasTips && (
            <div className="s-card preview-missing">Add a price, free viewing or a tip jar and your offers appear here.</div>
          )}

          {extras && (
            <div className="s-extras">
              {f.pwyw_enabled && (
                <PayWhatYouWant
                  film={f}
                  days={days}
                  finish={finish}
                  onWatch={(cents) => (canWatch ? open(f.pwyw_access) : live ? checkout("pwyw", cents) : setTried("pwyw"))}
                  tried={tried === "pwyw"}
                  note={note}
                  busy={busy === "pwyw"}
                />
              )}
              {f.free_watch && (
                <div className="s-card s-free">
                  <h3>Watch for free</h3>
                  <p className="s-sub">No payment needed. If you enjoy it, consider supporting the filmmaker.</p>
                  <button type="button" className="s-btn" onClick={() => (canWatch || f.vimeo_url ? open("free") : setTried("free"))}>
                    ▶ Watch Free
                  </button>
                  {tried === "free" && (
                    <p className="s-fine preview-note" role="status">
                      Add your film link and the film plays here.
                    </p>
                  )}
                </div>
              )}
              {hasTips && <TipJar film={f} />}
            </div>
          )}
          {live && !acc?.access && (offers > 0 || f.pwyw_enabled) && <AlreadyPaid />}
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

// "Already paid? Watch now": emails a one-time link that signs the viewer in on this film's address.
function AlreadyPaid() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"" | "sending" | "sent">("");
  const [error, setError] = useState("");
  const id = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      await api("/watch/signin", { body: { email } });
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("");
    }
  }

  if (!open) {
    return (
      <p className="s-already">
        <button type="button" className="link-btn" onClick={() => setOpen(true)}>
          Already paid? Watch now
        </button>
      </p>
    );
  }
  return (
    <form className="s-already s-already-form" onSubmit={submit}>
      {state === "sent" ? (
        <p role="status">If {email} has bought or rented this film, a link to watch is on its way. Check your inbox.</p>
      ) : (
        <>
          <label htmlFor={id}>The email you paid with</label>
          <div className="s-already-row">
            <input id={id} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="s-btn" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Email me a link"}
            </button>
          </div>
          {error && <p className="s-fine s-pwyw-err" role="alert">{error}</p>}
        </>
      )}
    </form>
  );
}

// What a viewer gets after paying: the film in a large player where the poster and price boxes were,
// their access terms, and the bonus features for what they bought, playable in the same player.
function ScreeningRoom({ film: f, kind, admin, days, finish, endsAt, onSwitch, onClose }: {
  film: Film; kind: "rent" | "buy" | "free"; admin: boolean; days: number; finish: string; endsAt?: string | null; onSwitch: (k: "rent" | "buy") => void; onClose: () => void;
}) {
  // Free viewing is the film alone: bonus features come with a rental or purchase.
  const items = [{ title: "The film", url: f.vimeo_url || "" }, ...(kind === "free" ? [] : f.bonus[kind].videos)];
  const [playing, setPlaying] = useState(0);
  useEffect(() => setPlaying(0), [kind]);
  const current = items[playing];
  const src = embedUrl(current.url);
  const both = f.rent_price_cents != null && f.buy_price_cents != null;

  return (
    <section className="s-screen" aria-label={`Watching ${f.title}`}>
      <div className="s-screen-admin">
        {admin &&
          (kind === "free" ? (
            <span>Admin view: what anyone sees when they watch free.</span>
          ) : (
            <span>Admin view: what a {kind === "rent" ? "renter" : "buyer"} sees after paying.</span>
          ))}
        {admin && both && kind !== "free" && (
          <button type="button" className="link-btn" onClick={() => onSwitch(kind === "rent" ? "buy" : "rent")}>
            Show the {kind === "rent" ? "buyer" : "renter"} view
          </button>
        )}
        <button type="button" className="link-btn" onClick={onClose}>
          {kind === "free" || !admin ? "Back to the film page" : "Back to Rent and Buy"}
        </button>
      </div>

      {kind === "free" && (f.tip_venmo || f.tip_paypal || f.tip_zelle) && (
        <div className="s-screen-tips">
          <TipJar film={f} />
        </div>
      )}

      <div className="s-player">
        {src ? (
          <iframe key={src} src={src} title={`${f.title}: ${current.title}`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        ) : (
          <p className="s-player-missing">
            {current.url ? `This link can't be played here: ${current.url}` : "No link for the film yet."}
          </p>
        )}
      </div>

      <div className="s-screen-info">
        <div>
          <p className="s-now">
            Now playing: <strong>{playing === 0 ? f.title : current.title}</strong>
          </p>
          <p className="s-access">
            {kind === "free"
              ? "Free to watch, thanks to the filmmaker."
              : kind === "rent"
                ? endsAt
                  ? `Rented: ${timeLeft(endsAt)} left (ends ${when(endsAt)}).`
                  : `Rented. Start within ${days} days, then you have ${finish} to finish.`
                : "Yours to keep. Watch any time on this website."}{" "}
            {kind !== "free" && `On another device? Open this page and choose "Already paid? Watch now" with the email you paid with.`}
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
