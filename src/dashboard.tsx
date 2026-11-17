import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { site } from "./config";
import { api, getMe, signOut, type User } from "./api";
import { STATUS_LABEL, type Film, type FilmsResponse } from "./films";
import "./styles.css";
import "./dashboard.css";

/* Dashboard: every film on the account. Each one opens in /add-a-film/, where it's edited and set up. */

const home = import.meta.env.BASE_URL;
const editUrl = (f: Film) => `${home}add-a-film/?film=${f.id}`;

// The public address once a film is live (own domain → watch.<domain>, otherwise a subdomain of ours).
function liveAddress(f: Film) {
  if (f.address_type === "own" && f.own_domain) return `watch.${f.own_domain}`;
  if (f.subdomain) return `${f.subdomain}.${site.name}`;
  return null;
}

function nextStep(f: Film) {
  switch (f.status) {
    case "draft":
      if (f.missing.length) return `Finish the film details (${f.missing.length} left)`;
      return f.setup_status === "unpaid" ? "Pay the setup fee to send it for review" : "Send it for review";
    case "in_review":
      return "We're reviewing it. We'll email you when it's approved.";
    case "changes_requested":
      return "Make the changes we asked for, then send it back";
    case "approved":
      return "Connect Stripe and go live";
    case "live":
      return null;
  }
}

function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [films, setFilms] = useState<Film[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(async (u) => {
        if (!u) return location.replace(`${home}signin/`);
        setUser(u);
        setFilms((await api<FilmsResponse>("/films")).films);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="wrap dash-head-inner">
          <a href={home} className="wordmark">
            {site.name}
          </a>
          {user && (
            <div className="dash-user">
              {user.isAdmin && <a href={`${home}admin/`}>Admin</a>}
              <span className="dash-email">{user.email}</span>
              <button type="button" className="link-btn" onClick={() => signOut().finally(() => location.assign(home))}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="wrap dash-main">
        {error && <p className="dash-alert" role="alert">{error}</p>}
        {!films && !error && <p role="status">Loading…</p>}
        {films && (
          <>
            <div className="list-head">
              <h1>Your films</h1>
              <a className="btn btn-small" href={films.length ? `${home}add-a-film/?new=1` : `${home}add-a-film/`}>
                Add a film
              </a>
            </div>

            {films.length === 0 ? (
              <div className="list-empty">
                <p>You haven't added a film yet. Start with its title; everything else can come later.</p>
                <a className="btn" href={`${home}add-a-film/`}>
                  Add your first film
                </a>
              </div>
            ) : (
              <ul className="film-list">
                {films.map((f) => {
                  const addr = f.status === "live" ? liveAddress(f) : null;
                  const step = nextStep(f);
                  return (
                    <li key={f.id} className="film-row">
                      <a href={editUrl(f)} className="film-row-poster" tabIndex={-1} aria-hidden="true">
                        {f.poster_url ? <img src={f.poster_url} alt="" loading="lazy" /> : <span>{f.title.slice(0, 1)}</span>}
                      </a>
                      <div className="film-row-body">
                        <h2>
                          <a href={editUrl(f)}>{f.title}</a>
                          {f.year && <span className="film-row-year"> ({f.year})</span>}
                        </h2>
                        <p className="film-row-status">
                          <span className={`pill pill-${f.status}`}>{STATUS_LABEL[f.status]}</span>
                          {step && <span>{step}</span>}
                        </p>
                        {addr && (
                          <p className="film-row-addr">
                            <a href={`https://${addr}`} target="_blank" rel="noopener">
                              {addr}
                            </a>
                          </p>
                        )}
                      </div>
                      <a className="btn btn-small btn-red film-row-open" href={editUrl(f)}>
                        {f.editable ? "Edit" : "View"}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>
);
