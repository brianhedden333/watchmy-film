import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { site } from "./config";
import { api, dollars, getMe } from "./api";
import { pageTheme, type Film } from "./films";
import "./styles.css";
import "./sample.css";

/* Preview of a filmmaker's watch page: the same layout as /sample/, filled from their saved film.
   A banner on top says it's a preview; Rent and Buy don't charge anyone. */

const home = import.meta.env.BASE_URL;
const filmId = Number(new URLSearchParams(location.search).get("film"));

// YouTube or Vimeo page link → embeddable player address. Anything else: no player.
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

function liveAddress(f: Film) {
  if (f.address_type === "own" && f.own_domain) return `watch.${f.own_domain}`;
  if (f.subdomain) return `${f.subdomain}.${site.name}`;
  return null;
}

function Preview() {
  const [film, setFilm] = useState<Film | null>(null);
  const [mine, setMine] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(async (u) => {
        if (!u) return location.replace(`${home}signin/`);
        if (!filmId) throw new Error("No film chosen. Open the preview from your film's page.");
        const r = await api<{ film: Film }>(`/films/${filmId}`);
        setMine(r.film.user_id === u.id); // admins can preview anyone's film
        setAdmin(u.isAdmin);
        setFilm(r.film);
        document.title = `Preview: ${r.film.title} | ${site.name}`;
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error || !film) {
    return (
      <div className="sample">
        <PreviewBanner film={null} />
        <div className="s-wrap s-main">{error ? <p role="alert">{error}</p> : <p role="status">Loading preview…</p>}</div>
      </div>
    );
  }

  return (
    <div className="sample" style={pageTheme(film)}>
      {mine && !admin ? <PreviewBanner film={film} /> : <AdminBanner film={film} mine={mine} />}
      {film.hidden && !showFull ? (
        <HoldingPage film={film} onShowFull={() => setShowFull(true)} />
      ) : (
        <WatchPage film={film} canWatch={admin} />
      )}
    </div>
  );
}

function PreviewBanner({ film }: { film: Film | null }) {
  const addr = film && liveAddress(film);
  const back = film ? `${home}add-a-film/?film=${film.id}` : `${home}dashboard/`;
  return (
    <div className="preview-bar" role="region" aria-label="Preview notice">
      <div className="preview-bar-text">
        <p className="preview-bar-title">
          This is a preview of your watch page{film && film.status !== "live" ? ". Only you can see it." : "."}
        </p>
        <p>
          Rent and Buy are switched off here, so nobody is charged.
          {film && film.status !== "live" && (addr ? ` Once it's live, it will be at ${addr}.` : " It goes public once it's approved and live.")}
          {film && film.missing.length > 0 && ` Still to add: ${film.missing.join(", ")}.`}
        </p>
      </div>
      <a href={back} className="btn btn-small">
        {film ? (film.editable ? "Back to editing" : "Back to your film") : "Back to your films"}
      </a>
    </div>
  );
}

function AdminBanner({ film, mine }: { film: Film; mine: boolean }) {
  return (
    <div className="preview-bar" role="region" aria-label="Preview notice">
      <div className="preview-bar-text">
        <p className="preview-bar-title">Admin preview of {film.title}.</p>
        <p>Nobody is charged here. Click Rent Now or Buy Now to see the film the way a renter or buyer does.</p>
      </div>
      <a href={mine ? `${home}add-a-film/?film=${film.id}` : `${home}admin/`} className="btn btn-small">
        {mine ? "Back to editing" : "Back to admin"}
      </a>
    </div>
  );
}

// What a hidden film's address shows: its look and title, and a short note. No prices, player or trailer.
function HoldingPage({ film: f, onShowFull }: { film: Film; onShowFull: () => void }) {
  const hero = f.banner_url || f.still_url;
  return (
    <>
      <div className="holding-note">
        <span>Your page is hidden, so this holding page is what visitors see.</span>
        <button type="button" className="link-btn" onClick={onShowFull}>
          See the full page
        </button>
      </div>
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

function WatchPage({ film: f, canWatch }: { film: Film; canWatch: boolean }) {
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
          Preview only: on your live page this opens checkout.
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
        <div className={`s-buy offers-${offers}`}>
          {f.poster_url ? (
            <img src={f.poster_url} alt={`${f.title} poster`} className="s-poster" />
          ) : (
            <div className="s-poster preview-missing">Your poster goes here</div>
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

          {offers === 0 && (
            <div className="s-card preview-missing">Add a rent or buy price and your offers appear here.</div>
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

          <h2>About</h2>
          {paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p className="preview-missing-text">Your synopsis goes here.</p>}

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
