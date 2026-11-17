import { StrictMode, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { site } from "./config";
import { api, dollars, getMe, type User } from "./api";
import { STATUS_LABEL, type Film } from "./films";
import { AppHeader } from "./AppHeader";
import "./styles.css";
import "./dashboard.css";

/* Admin: review submitted films, make setup fee waiver codes for friends and early customers, see accounts. */

const home = import.meta.env.BASE_URL;

type AdminFilm = Film & StripeCols & { owner_email: string; owner_name: string | null; codes_used: string | null; paid_cents: number | null; sales_cents: number; sales_count: number; submitted_at: string | null; updated_at: string };
type Code = { id: number; code: string; max_uses: number | null; uses: number; expires_at: string | null; active: number; note: string | null; used_by: string | null; created_at: string };
type StripeCols = { stripe_has_account: number | null; stripe_email: string | null; stripe_account_id: string | null; stripe_country: string | null };
type AdminUser = StripeCols & { id: number; email: string; name: string | null; created_at: string; last_login_at: string | null; films: number };
const stripeText = (u: StripeCols) =>
  u.stripe_has_account == null ? "Not given" : u.stripe_has_account ? [u.stripe_email, u.stripe_account_id, u.stripe_country].filter(Boolean).join(" · ") : `No account yet (${u.stripe_country})`;
type Overview = { films: AdminFilm[]; users: AdminUser[]; codes: Code[]; revenue: { cents: number; n: number }; statuses: Film["status"][]; setupFeeCents: number };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

function Admin() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"films" | "codes" | "users">("films");
  const [user, setUser] = useState<User | null>(null);

  const load = () => api<Overview>("/admin/overview").then(setData).catch((e) => setError(e.message));

  useEffect(() => {
    getMe().then((u) => {
      if (!u) return location.replace(`${home}signin/`);
      setUser(u);
      if (!u.isAdmin) return setError("This page is for admins.");
      load();
    });
  }, []);

  const inReview = data?.films.filter((f) => f.status === "in_review").length ?? 0;

  return (
    <div className="dash">
      <AppHeader user={user} />

      <main className="wrap dash-main">
        <h1>Admin</h1>
        {error && <p className="dash-alert" role="alert">{error}</p>}
        {data && (
          <>
            <dl className="stats">
              <div><dt>In review</dt><dd>{inReview}</dd></div>
              <div><dt>Films</dt><dd>{data.films.length}</dd></div>
              <div><dt>Accounts</dt><dd>{data.users.length}</dd></div>
              <div><dt>Setup fees</dt><dd>{dollars(data.revenue.cents)}</dd></div>
            </dl>

            <div className="admin-tabs" role="tablist">
              {(["films", "codes", "users"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className="film-tab" onClick={() => setTab(t)}>
                  {{ films: "Films", codes: "Waiver codes", users: "Accounts" }[t]}
                </button>
              ))}
            </div>

            {tab === "films" && <Films films={data.films} statuses={data.statuses} reload={load} />}
            {tab === "codes" && <Codes codes={data.codes} fee={data.setupFeeCents} reload={load} />}
            {tab === "users" && <Users users={data.users} />}
          </>
        )}
      </main>
    </div>
  );
}

function Films({ films, statuses, reload }: { films: AdminFilm[]; statuses: Film["status"][]; reload: () => void }) {
  if (!films.length) return <p>No films yet.</p>;
  return (
    <div className="admin-films">
      {films.map((f) => (
        <AdminFilmCard key={f.id} film={f} statuses={statuses} reload={reload} />
      ))}
    </div>
  );
}

function AdminFilmCard({ film, statuses, reload }: { film: AdminFilm; statuses: Film["status"][]; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(film.status);
  const [note, setNote] = useState(film.admin_note || "");
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg("Saving…");
    try {
      const r = await api<{ emailed: boolean }>(`/admin/films/${film.id}`, { method: "PATCH", body: { status, admin_note: note, notify } });
      setMsg(r.emailed ? "Saved and emailed the filmmaker." : "Saved.");
      reload();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  const setup =
    film.setup_status === "paid" ? `Paid ${dollars(film.paid_cents)}` : film.setup_status === "waived" ? `Waived (${film.codes_used || "code"})` : "Unpaid";
  const price = [film.rent_price_cents && `Rent ${dollars(film.rent_price_cents)}`, film.buy_price_cents && `Buy ${dollars(film.buy_price_cents)}`].filter(Boolean).join(" · ");
  const address = film.address_type === "own" ? `watch.${film.own_domain || "?"}` : `${film.subdomain || "?"}.${site.name}`;

  return (
    <article className="admin-film">
      <button type="button" className="admin-film-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="admin-thumb">{film.poster_url && <img src={film.poster_url} alt="" />}</span>
        <span className="admin-film-title">
          <strong>{film.title}</strong>
          <span>{film.owner_email}</span>
        </span>
        <span className="admin-earned">
          <strong>{dollars(film.sales_cents)}</strong>
          <span>
            earned · {film.sales_count} {film.sales_count === 1 ? "sale" : "sales"}
          </span>
        </span>
        <span className={`pill pill-${film.status}`}>{STATUS_LABEL[film.status]}</span>
        <svg className="admin-caret" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>

      {open && (
        <div className="admin-film-body">
          <dl className="admin-details">
            <div><dt>Submitted</dt><dd>{day(film.submitted_at) || "Not yet"}</dd></div>
            <div><dt>Setup fee</dt><dd>{setup}</dd></div>
            <div><dt>Earned</dt><dd>{dollars(film.sales_cents)} from {film.sales_count} {film.sales_count === 1 ? "sale" : "sales"}</dd></div>
            <div><dt>Missing</dt><dd>{film.missing.length ? film.missing.join(", ") : "Nothing"}</dd></div>
            <div><dt>Prices</dt><dd>{price || "None"}{film.rental_days ? ` · ${film.rental_days} days to start, ${film.rental_hours ?? "?"} h to finish` : ""}</dd></div>
            <div><dt>Images</dt><dd className="admin-images">{film.poster_url ? <a href={film.poster_url} target="_blank" rel="noreferrer"><img src={film.poster_url} alt="Poster" /></a> : "No poster"}{film.still_url ? <a href={film.still_url} target="_blank" rel="noreferrer"><img src={film.still_url} alt="Wide image" /></a> : "No wide image"}{film.banner_url && <a href={film.banner_url} target="_blank" rel="noreferrer"><img src={film.banner_url} alt="Banner" /></a>}</dd></div>
            <div><dt>Colors</dt><dd className="swatches">{(["color_background", "color_primary", "color_secondary", "color_button"] as const).map((k) => film[k] ? <span key={k} title={`${k.replace("color_", "")}: ${film[k]}`} style={{ background: film[k]! }} /> : null)}{!film.color_background && !film.color_primary && !film.color_secondary && !film.color_button && "Defaults"}</dd></div>
            <div><dt>Plan</dt><dd>{film.tier === "secure" ? "Secure (10%)" : "Standard (8%)"}</dd></div>
            <div><dt>Address</dt><dd>{address}</dd></div>
            <div><dt>Vimeo</dt><dd>{film.vimeo_url ? <a href={film.vimeo_url} target="_blank" rel="noreferrer">{film.vimeo_url}</a> : "None"}</dd></div>
            <div><dt>Trailer</dt><dd>{film.trailer_url ? <a href={film.trailer_url} target="_blank" rel="noreferrer">{film.trailer_url}</a> : "None"}</dd></div>
            <div><dt>Details</dt><dd>{[film.year, film.runtime_minutes && `${film.runtime_minutes} min`, film.languages, film.genre].filter(Boolean).join(" · ") || "None"}</dd></div>
            <div><dt>Credits</dt><dd>{film.credits.filter((c) => c.names.length).map((c) => <span key={c.role} className="credit-line"><strong>{c.role}:</strong> {c.names.join(", ")}</span>)}{!film.credits.some((c) => c.names.length) && "None"}</dd></div>
            <div><dt>Stripe</dt><dd>{stripeText(film)}</dd></div>
            <div><dt>Contact</dt><dd>{[film.contact_name || film.owner_name, film.owner_email, film.contact_phone].filter(Boolean).join(" · ")}</dd></div>
          </dl>
          <p>
            <a href={`${home}preview/?film=${film.id}`} target="_blank" rel="noopener">
              Open their watch page preview
            </a>
          </p>
          {film.logline && <p><em>{film.logline}</em></p>}
          {film.synopsis && <p className="admin-synopsis">{film.synopsis}</p>}
          {film.notes && <p className="admin-synopsis"><strong>Their notes:</strong> {film.notes}</p>}

          <form className="admin-review" onSubmit={save}>
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as Film["status"])}>
                {statuses.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label>
              Note to the filmmaker (shown on their film page and in the email)
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              Email them if the status changes
            </label>
            <div className="save-bar">
              <button className="btn btn-small">Save</button>
              <span className="save-state" role="status">{msg}</span>
            </div>
          </form>
        </div>
      )}
    </article>
  );
}

function Codes({ codes, fee, reload }: { codes: Code[]; fee: number; reload: () => void }) {
  const [msg, setMsg] = useState("");

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setMsg("");
    try {
      await api("/admin/codes", { body: { code: f.get("code"), max_uses: f.get("max_uses"), expires_on: f.get("expires_on"), note: f.get("note") } });
      form.reset();
      reload();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  const toggle = (c: Code) => api(`/admin/codes/${c.id}`, { method: "PATCH", body: { active: !c.active } }).then(reload);

  return (
    <div className="admin-codes">
      <form className="code-create" onSubmit={create}>
        <h2>New waiver code</h2>
        <p className="fieldset-hint">A code skips the {dollars(fee).replace(".00", "")} setup fee. Give it to friends and early customers.</p>
        <div className="code-create-row">
          <label>Code<input name="code" required pattern="[A-Za-z0-9_\-]{3,40}" placeholder="QUEERDOS" onInput={(e) => (e.currentTarget.value = e.currentTarget.value.toUpperCase())} /></label>
          <label>Max uses<input name="max_uses" type="number" min={1} defaultValue={1} placeholder="Unlimited" /></label>
          <label>Expires (optional)<input name="expires_on" type="date" /></label>
          <label className="grow">Note (who it's for)<input name="note" maxLength={300} /></label>
          <button className="btn btn-small">Create code</button>
        </div>
        {msg && <p className="field-err" role="alert">{msg}</p>}
      </form>

      {codes.length === 0 ? (
        <p>No codes yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Code</th><th>Used</th><th>Used by</th><th>Expires</th><th>Note</th><th></th></tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className={c.active ? "" : "inactive"}>
                  <td><code>{c.code}</code></td>
                  <td>{c.uses} of {c.max_uses ?? "∞"}</td>
                  <td>{c.used_by || ""}</td>
                  <td>{day(c.expires_at) || "Never"}</td>
                  <td>{c.note || ""}</td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => toggle(c)}>
                      {c.active ? "Turn off" : "Turn on"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Users({ users }: { users: AdminUser[] }) {
  return (
    <div className="table-wrap">
      <table className="admin-table">
        <thead>
          <tr><th>Email</th><th>Name</th><th>Films</th><th>Joined</th><th>Last sign-in</th><th>Stripe</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.name || ""}</td>
              <td>{u.films}</td>
              <td>{day(u.created_at)}</td>
              <td>{day(u.last_login_at) || "Never"}</td>
              <td>{stripeText(u)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Admin />
  </StrictMode>
);
