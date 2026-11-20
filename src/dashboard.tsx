import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, getMe, type User } from "./api";
import { pricing } from "./config";
import { liveAddress, pillClass, statusLabel, type Film, type FilmsResponse } from "./films";
import { AppHeader } from "./AppHeader";
import "./styles.css";
import "./dashboard.css";

/* Dashboard: every film on the account. Each one opens in /add-a-film/, where it's edited and set up. */

const home = import.meta.env.BASE_URL;
const editUrl = (f: Film) => `${home}add-a-film/?film=${f.id}`;

// The public address once a film is live (own domain → watch.<domain>, otherwise a subdomain of ours).
function nextStep(f: Film) {
  switch (f.status) {
    case "draft":
      if (f.missing.length) return `Finish the film details (${f.missing.length} left)`;
      return f.setup_status === "unpaid" && pricing.setupUpfront ? "Pay the setup fee to send it for review" : "Send it for review";
    case "in_review":
      return "We're reviewing it. We'll email you when it's approved.";
    case "changes_requested":
      return "Make the changes we asked for, then send it back";
    case "approved":
      return "Approved: go live when you're ready";
    case "live":
      return f.hidden ? "Hidden: visitors see a holding page" : null;
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
      <AppHeader user={user} />

      <main className="wrap dash-main">
        {error && <p className="dash-alert" role="alert">{error}</p>}
        {!films && !error && <p role="status">Loading…</p>}
        {films && (
          <>
            <div className="list-head">
              <h1>My Films</h1>
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
                  const addr = f.status === "live" && !f.hidden ? liveAddress(f) : null;
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
                          <span className={pillClass(f)}>{statusLabel(f)}</span>
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
                      <div className="film-row-actions">
                        {f.status === "live" && liveAddress(f) ? (
                          <a className="link-btn" href={`https://${liveAddress(f)}`} target="_blank" rel="noopener">
                            View page
                          </a>
                        ) : (
                          <a className="link-btn" href={`${home}preview/?film=${f.id}`}>
                            Preview
                          </a>
                        )}
                        <a className="btn btn-small btn-red" href={editUrl(f)}>
                          Edit
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {films.length > 0 && <Sales />}
          </>
        )}
      </main>
    </div>
  );
}

// ---------- Sales: every viewer sale across their films, with Stripe's fee, ours, and what they earned ----------

type Sale = {
  id: number;
  date: string;
  film_id: number;
  film_title: string;
  kind: "rent" | "buy" | "pwyw";
  amount: number;
  stripe_fee: number | null;
  our_fee: number;
  setup_part: number;
  net: number | null;
};
type SalesResponse = {
  sales: Sale[];
  totals: { count: number; amount: number; stripe_fee: number; our_fee: number; setup_part: number; net: number; pending: number };
  setup: { id: number; title: string; recovered: number; setup_fee: number }[];
};

const money = (c: number | null) => (c == null ? "…" : `$${(c / 100).toFixed(2)}`);
const KIND = { rent: "Rental", buy: "Purchase", pwyw: "Pay what you want" } as const;
const saleDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function Sales() {
  const [data, setData] = useState<SalesResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<SalesResponse>("/sales").then(setData).catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="dash-alert" role="alert">{error}</p>;
  if (!data) return null;
  const { sales, totals, setup } = data;
  const several = new Set(sales.map((s) => s.film_id)).size > 1;

  return (
    <section className="sales" aria-labelledby="sales-h">
      <h2 id="sales-h">Sales</h2>
      {sales.length === 0 ? (
        <p className="settings-hint">No sales yet. Rentals, purchases and pay-what-you-want sales show up here as they happen.</p>
      ) : (
        <>
          <div className="sales-totals">
            <div>
              <span>You earned</span>
              <strong className="sales-earned">{money(totals.net)}</strong>
            </div>
            <div>
              <span>Sales</span>
              <strong>{money(totals.amount)}</strong>
              <em>{totals.count} {totals.count === 1 ? "sale" : "sales"}</em>
            </div>
            <div>
              <span>Stripe fees</span>
              <strong>{money(totals.stripe_fee)}</strong>
            </div>
            <div>
              <span>Our fees</span>
              <strong>{money(totals.our_fee)}</strong>
              {totals.setup_part > 0 && <em>incl. {money(totals.setup_part)} toward setup</em>}
            </div>
          </div>
          {totals.pending > 0 && (
            <p className="settings-hint">
              Stripe's fee isn't in yet for {totals.pending} recent {totals.pending === 1 ? "sale" : "sales"}, so "You earned" leaves
              {totals.pending === 1 ? " it" : " them"} out for now.
            </p>
          )}

          <div className="sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  {several && <th scope="col">Film</th>}
                  <th scope="col">Type</th>
                  <th scope="col" className="num">Paid</th>
                  <th scope="col" className="num">Stripe fee</th>
                  <th scope="col" className="num">Our fee</th>
                  <th scope="col" className="num">You earned</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td>{saleDate(s.date)}</td>
                    {several && <td>{s.film_title}</td>}
                    <td>{KIND[s.kind] ?? s.kind}</td>
                    <td className="num">{money(s.amount)}</td>
                    <td className="num">{money(s.stripe_fee)}</td>
                    <td className="num" title={s.setup_part ? `${money(s.setup_part)} of this went toward your setup cost` : undefined}>
                      {money(s.our_fee)}
                      {s.setup_part > 0 && <span className="sales-setup"> incl. {money(s.setup_part)} setup</span>}
                    </td>
                    <td className="num sales-net">{money(s.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {setup.map((f) => (
        <p key={f.id} className="settings-hint sales-setup-line">
          {setup.length > 1 ? `${f.title}: ` : ""}Setup cost: {money(Math.min(f.recovered, f.setup_fee))} of {money(f.setup_fee)} recovered.
          {f.recovered >= f.setup_fee ? " All paid off: from now on only our regular fee applies." : " Up to $1 of our fee on each sale goes toward it until it's covered."}
        </p>
      ))}
      <p className="settings-hint">
        Money from sales goes straight to your Stripe account and is paid out to your bank on Stripe's schedule.{" "}
        <a href="https://dashboard.stripe.com/" target="_blank" rel="noopener">
          Open your Stripe Dashboard
        </a>
      </p>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>
);
