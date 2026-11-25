import { StrictMode, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError, dollars, getMe, type ConnectInfo, type User } from "./api";
import { BONUS_MAX, COLOR_DEFAULTS, liveAddress, liveHref, pageTheme, pillClass, STATUS_LABEL, statusLabel, type Bonus, type BonusSet, type ColorKey, type Credit, type Film, type FilmsResponse } from "./films";
import { AppHeader } from "./AppHeader";
import { ConnectStripe } from "./ConnectStripe";
import { CLUB_DOMAIN, cross, screeningUrl } from "./sites";
import { cleanTag, QUICK_TAGS, suggestTags, TAG_RE, TAGS_MAX } from "./tags";
import "./styles.css";
import "./sample.css";
import "./dashboard.css";

/* Add a film (onboarding, and where each film is edited): add a film, fill in its details, then send it to review.
   Nothing up front: the setup cost is recovered per sale later. With SETUP_UPFRONT=1 on the server, the old step comes back:
   pay the setup fee (or use a code) to send it to review. */

const home = import.meta.env.BASE_URL;
// /add-a-film/?new=1 (from the films list) opens the "add another film" box straight away.
const startAdding = new URLSearchParams(location.search).has("new");

// Form fields kept as strings while editing; prices are typed in dollars.
const TEXT_FIELDS = [
  "title", "logline", "synopsis", "year", "runtime_minutes", "languages", "genre", "trailer_url", "vimeo_url",
  "rental_days", "rental_watch_days", "tier", "address_type", "subdomain", "own_domain", "contact_name", "contact_phone", "notes",
  "color_background", "color_primary", "color_secondary", "color_button",
  "pwyw_access", "tip_venmo", "tip_paypal", "tip_zelle", "ai_used", "ai_use_notes",
] as const;
type FormState = Record<(typeof TEXT_FIELDS)[number] | "rent_enabled" | "rent_price" | "buy_enabled" | "buy_price" | "pwyw_enabled" | "pwyw_min" | "pwyw_suggested" | "free_watch" | "discoverable" | "hide_title" | "rights_confirmed_at" | "playback_confirmed_at", string>;

function toForm(f: Film): FormState {
  const out = {} as FormState;
  for (const k of TEXT_FIELDS) out[k] = f[k] == null ? "" : String(f[k]);
  out.rent_price = f.rent_price_cents == null ? "" : (f.rent_price_cents / 100).toFixed(2);
  out.buy_price = f.buy_price_cents == null ? "" : (f.buy_price_cents / 100).toFixed(2);
  // Rent and Buy are on when they have a price; turning one off saves no price for it.
  out.rent_enabled = f.rent_price_cents == null ? "" : "1";
  out.buy_enabled = f.buy_price_cents == null ? "" : "1";
  out.pwyw_enabled = f.pwyw_enabled ? "1" : "";
  out.pwyw_min = (f.pwyw_min_cents / 100).toFixed(2);
  out.pwyw_suggested = f.pwyw_suggested_cents == null ? "" : (f.pwyw_suggested_cents / 100).toFixed(2);
  out.free_watch = f.free_watch ? "1" : "";
  out.hide_title = f.hide_title ? "1" : "";
  out.rights_confirmed_at = f.rights_confirmed_at || "";
  out.playback_confirmed_at = f.playback_confirmed_at || "";
  out.discoverable = f.discoverable ? "1" : "";
  return out;
}

// The standard roles always show, even when empty; filmmakers can add names to them and add roles of their own.
const DEFAULT_ROLES = ["Director", "Producers", "Cast", "Cinematographer"];

function toCredits(f: Film): Credit[] {
  const saved = f.credits.map((c) => ({ role: c.role, names: c.names.length ? [...c.names] : [""] }));
  if (!saved.some((c) => /^directors?$/i.test(c.role)) && f.director) saved.unshift({ role: "Director", names: f.director.split(/,\s*/) });
  const missing = DEFAULT_ROLES.filter((r) => !saved.some((c) => c.role.toLowerCase() === r.toLowerCase())).map((role) => ({ role, names: [""] }));
  const all = [...saved, ...missing];
  // Keep the standard roles first, in their usual order.
  const rank = (c: Credit) => {
    const i = DEFAULT_ROLES.findIndex((r) => r.toLowerCase() === c.role.toLowerCase());
    return i === -1 ? DEFAULT_ROLES.length : i;
  };
  return all.map((c, i) => [c, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([c]) => c);
}

const toBonus = (f: Film): Bonus => JSON.parse(JSON.stringify(f.bonus));

function toBody(s: FormState, credits: Credit[], bonus: Bonus, tags: string[]) {
  const body: Record<string, string | number | null | Credit[] | Bonus | string[]> = { credits, bonus, tags };
  for (const k of TEXT_FIELDS) body[k] = s[k];
  const cents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(/[$,\s]/g, "")) * 100));
  body.rent_price_cents = s.rent_enabled ? cents(s.rent_price) : null;
  body.buy_price_cents = s.buy_enabled ? cents(s.buy_price) : null;
  body.pwyw_enabled = s.pwyw_enabled ? 1 : 0;
  body.pwyw_min_cents = cents(s.pwyw_min);
  body.pwyw_suggested_cents = cents(s.pwyw_suggested);
  body.free_watch = s.free_watch ? 1 : 0;
  body.hide_title = s.hide_title ? 1 : 0;
  body.rights_confirmed_at = s.rights_confirmed_at || null;
  body.playback_confirmed_at = s.playback_confirmed_at || null;
  body.discoverable = s.discoverable ? 1 : 0;
  return body;
}

function AddFilm() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [data, setData] = useState<FilmsResponse | null>(null);
  const [selected, setSelected] = useState<number | null>(() => Number(new URLSearchParams(location.search).get("film")) || null);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");

  async function load() {
    try {
      const r = await api<FilmsResponse>("/films");
      setData(r);
      setSelected((cur) => (cur && r.films.some((f) => f.id === cur) ? cur : r.films[0]?.id ?? null));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }

  useEffect(() => {
    getMe()
      .then(async (u) => {
        if (!u) return location.replace(`${home}signin/`);
        setUser(u);
        // Back from Stripe Checkout
        const q = new URLSearchParams(location.search);
        const film = Number(q.get("film"));
        if (q.get("session_id") && film) {
          const r = await api<{ film: Film }>(`/films/${film}/confirm`, { body: { session_id: q.get("session_id") } }).catch(() => null);
          setNotice(
            r?.film.setup_status === "paid"
              ? "Payment received. Your film is in review."
              : "Payment is processing. This page will update once Stripe confirms it."
          );
        } else if (q.get("canceled")) {
          setNotice("Checkout canceled. You haven't been charged.");
        }
        if (q.get("session_id") || q.get("canceled")) history.replaceState(null, "", `${location.pathname}?film=${film}`);
        await load();
      })
      .catch((e) => setLoadError((e as Error).message));
  }, []);

  function pick(id: number) {
    setSelected(id);
    setNotice("");
    history.replaceState(null, "", `${location.pathname}?film=${id}`);
  }

  function replaceFilm(f: Film) {
    setData((d) => (d ? { ...d, films: d.films.map((x) => (x.id === f.id ? f : x)) } : d));
  }

  const film = data?.films.find((f) => f.id === selected) || null;
  // Adding another film: show only the empty "new film" box, not the form of the film that was open.
  const [adding, setAdding] = useState(startAdding);

  return (
    <div className="dash">
      <AppHeader user={user} />

      <main className="wrap dash-main">
        {loadError && <p className="dash-alert" role="alert">{loadError}</p>}
        {!data && !loadError && <p role="status">Loading…</p>}
        {data && (
          <>
            {data.films.length > 0 && (
              <FilmTabs
                films={data.films}
                selected={adding ? null : selected}
                adding={adding}
                setAdding={setAdding}
                onPick={(id) => {
                  setAdding(false);
                  pick(id);
                }}
                onAdded={(f) => {
                  setData({ ...data, films: [f, ...data.films] });
                  pick(f.id);
                }}
              />
            )}
            {notice && <p className="dash-notice" role="status">{notice}</p>}
            {data.films.length === 0 ? (
              <NewFilm needsTerms={user?.agreedTerms === false} onCreated={(f) => { setData({ ...data, films: [f] }); setAdding(false); pick(f.id); }} />
            ) : (
              !adding && film && <FilmView key={film.id} film={film} meta={data} onChange={replaceFilm} stripe={user?.connect ?? null} onStripe={(c) => setUser((u) => (u ? { ...u, connect: c } : u))} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function FilmTabs({ films, selected, adding, setAdding, onPick, onAdded }: {
  films: Film[]; selected: number | null; adding: boolean; setAdding: (v: boolean) => void; onPick: (id: number) => void; onAdded: (f: Film) => void;
}) {
  return (
    <div className="film-tabs">
      <div className="film-tabs-list" role="tablist" aria-label="Your films">
        {films.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={f.id === selected} className="film-tab" onClick={() => onPick(f.id)}>
            <span>{f.title}</span>
            <span className={pillClass(f)}>{statusLabel(f)}</span>
          </button>
        ))}
        {!adding && (
          <button type="button" className="film-tab film-tab-add" onClick={() => setAdding(true)}>
            + Add another film
          </button>
        )}
      </div>
      {adding && <NewFilm compact onCreated={(f) => { setAdding(false); onAdded(f); }} onCancel={() => setAdding(false)} />}
    </div>
  );
}

function NewFilm({ onCreated, compact, onCancel, needsTerms = false }: { onCreated: (f: Film) => void; compact?: boolean; onCancel?: () => void; needsTerms?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Accounts that began as viewers agree to the filmmaker Terms with their first film.
  const [askTerms, setAskTerms] = useState(needsTerms);
  const [terms, setTerms] = useState(false);
  const id = useId();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = String(new FormData(e.currentTarget).get("title")).trim();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ film: Film }>("/films", { body: { title, ...(askTerms ? { terms } : {}) } });
      onCreated(r.film);
    } catch (err) {
      setError((err as Error).message);
      if (/agree to the Terms/i.test((err as Error).message)) setAskTerms(true);
      setBusy(false);
    }
  }

  return (
    <section className={compact ? "new-film compact" : "new-film"}>
      {!compact && (
        <>
          <h1>Add your film</h1>
          <p className="lede">Start with the title. You can fill in the rest and come back any time; everything saves to your account.</p>
        </>
      )}
      <form onSubmit={onSubmit} className="new-film-form">
        <label htmlFor={id}>Film title</label>
        <div className="try-row">
          <input id={id} name="title" required maxLength={200} autoFocus={compact} placeholder="e.g. The Queerdos" />
          <button className="btn" disabled={busy}>
            {busy ? "Adding…" : "Add film"}
          </button>
          {onCancel && (
            <button type="button" className="link-btn" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
        {askTerms && (
          <label className="new-film-terms">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
            <span>
              I agree to the{" "}
              <a href={`${import.meta.env.BASE_URL}terms/`} target="_blank" rel="noopener">
                Terms
              </a>{" "}
              for selling films on watchmyfilm.
            </span>
          </label>
        )}
        {error && <p className="field-err" role="alert">{error}</p>}
      </form>
    </section>
  );
}

function FilmView({ film, meta, onChange, stripe, onStripe }: { film: Film; meta: FilmsResponse; onChange: (f: Film) => void; stripe: ConnectInfo | null; onStripe: (c: ConnectInfo) => void }) {
  const [form, setForm] = useState<FormState>(() => toForm(film));
  const [saved, setSaved] = useState<FormState>(() => toForm(film));
  const [credits, setCredits] = useState<Credit[]>(() => toCredits(film));
  const [savedCredits, setSavedCredits] = useState<Credit[]>(() => toCredits(film));
  const [bonus, setBonus] = useState<Bonus>(() => toBonus(film));
  const [savedBonus, setSavedBonus] = useState<Bonus>(() => toBonus(film));
  const [tags, setTags] = useState<string[]>(() => [...film.tags]);
  const [savedTags, setSavedTags] = useState<string[]>(() => [...film.tags]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const dirty =
    JSON.stringify(form) !== JSON.stringify(saved) ||
    JSON.stringify(credits) !== JSON.stringify(savedCredits) ||
    JSON.stringify(bonus) !== JSON.stringify(savedBonus) ||
    JSON.stringify(tags) !== JSON.stringify(savedTags);
  // After approval everything stays editable except the link to the full film.
  const linkLocked = !film.editable;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (k: keyof FormState) => (v: string) => {
    setForm((s) => ({ ...s, [k]: v }));
    setSaveState("idle");
  };

  async function save(): Promise<boolean> {
    // A switched-on option needs its price.
    const priceErrs: Record<string, string> = {};
    if (form.rent_enabled && !form.rent_price.trim()) priceErrs.rent_price = "is needed while Rent is on";
    if (form.buy_enabled && !form.buy_price.trim()) priceErrs.buy_price = "is needed while Buy is on";
    if (Object.keys(priceErrs).length) {
      setErrors(priceErrs);
      setSaveError("Add the missing prices.");
      setSaveState("error");
      return false;
    }
    setSaveState("saving");
    setErrors({});
    try {
      const r = await api<{ film: Film }>(`/films/${film.id}`, { method: "PATCH", body: toBody(form, credits, bonus, tags) });
      onChange(r.film);
      const f = toForm(r.film);
      setForm(f);
      setSaved(f);
      const c = toCredits(r.film);
      setCredits(c);
      setSavedCredits(c);
      const b = toBonus(r.film);
      setBonus(b);
      setSavedBonus(b);
      setTags([...r.film.tags]);
      setSavedTags([...r.film.tags]);
      setSaveState("saved");
      return true;
    } catch (e) {
      const err = e as ApiError;
      const fieldErrs = { ...(err.errors || {}) };
      if (fieldErrs.rent_price_cents) fieldErrs.rent_price = "must be a price from $0.99 to $1,000";
      if (fieldErrs.buy_price_cents) fieldErrs.buy_price = "must be a price from $0.99 to $1,000";
      if (fieldErrs.pwyw_min_cents) fieldErrs.pwyw_min = "must be from $0.99 to $1,000";
      if (fieldErrs.pwyw_suggested_cents) fieldErrs.pwyw_suggested = fieldErrs.pwyw_suggested_cents;
      setErrors(fieldErrs);
      setSaveError(err.message);
      setSaveState("error");
      return false;
    }
  }

  // The preview shows saved details, so save any changes first.
  async function openPreview() {
    if (dirty && !(await save())) return;
    location.assign(`${home}preview/?film=${film.id}`);
  }

  const field = (k: keyof FormState, label: string, opts: { type?: string; hint?: ReactNode; placeholder?: string; multiline?: number; prefix?: string; suffix?: string; inputMode?: "decimal" | "numeric"; maxLength?: number } = {}) => (
    <Field
      label={label}
      hint={opts.hint}
      error={errors[k]}
      value={form[k]}
      onChange={set(k)}
      disabled={linkLocked && k === "vimeo_url"}
      name={k}
      {...opts}
    />
  );

  return (
    <div className="film-view">
      <div className="film-head">
        <div>
          <p className="eyebrow">Your film</p>
          <h1>{film.title}</h1>
        </div>
        <div className="film-head-actions">
          {film.status === "live" && liveAddress(film) ? (
            // Live: open the real page (a hidden film's address shows its holding page).
            <a className="btn btn-small btn-red" href={liveHref(film)!} target="_blank" rel="noopener">
              View page
            </a>
          ) : (
            <button type="button" className="btn btn-small btn-red" onClick={openPreview} disabled={saveState === "saving"}>
              Preview page
            </button>
          )}
          <span className={`${pillClass(film)} pill-big`}>{statusLabel(film)}</span>
        </div>
      </div>

      <Steps film={film} stripe={stripe} upfront={meta.setupUpfront} />

      <div className="film-grid">
        <form
          className="film-form"
          id="film-form"
          tabIndex={-1}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {linkLocked && (
            <p className="dash-notice">
              Your film is {STATUS_LABEL[film.status].toLowerCase()}. You can still edit everything here except the link to the
              full film. Need that changed? Reply to any of our emails.
            </p>
          )}

          <fieldset>
            <legend>The film</legend>
            {field("title", "Title")}
            {field("logline", "One-line description", {
              maxLength: LOGLINE_MAX,
              hint: "Shown under the title on your watch page, in Browse and in link previews. Keep it to one line.",
            })}
            {field("synopsis", "Synopsis", { multiline: 6 })}
            <div className="row-3">
              {field("year", "Year", { inputMode: "numeric", placeholder: "2026" })}
              {field("runtime_minutes", "Runtime", { inputMode: "numeric", suffix: "min" })}
              {field("languages", "Languages", { placeholder: "English, Spanish" })}
            </div>
            {field("genre", "Genre", { placeholder: "Documentary" })}
          </fieldset>

          <fieldset id="sec-images">
            <legend>Images</legend>
            <p className="fieldset-hint">
              The poster and wide image are required. The poster shows on desktop; the wide image shows on phones and when your
              link is shared. The banner is optional and runs across the top of your page.
            </p>
            <ImageUpload kind="poster" film={film} onChange={onChange} />
            <ImageUpload kind="still" film={film} onChange={onChange} />
            <ImageUpload kind="banner" film={film} onChange={onChange} />
          </fieldset>

          <fieldset>
            <legend>Video</legend>
            {field("vimeo_url", "Link to the full film (Vimeo or YouTube)", {
              placeholder: "https://vimeo.com/123456789",
              hint: (
                <>
                  <strong>Vimeo (recommended):</strong> open the film on Vimeo and click <strong>Share</strong>. (1) At the top,
                  set who can watch to <strong>Embed only</strong>, so it can't be watched on vimeo.com. (2) Click the{" "}
                  <strong>Embed</strong> button at the bottom to open the embed privacy settings, choose{" "}
                  <strong>Specific domains</strong>, and add <strong>indiefilm.club</strong> (that covers your film's address), so
                  it only plays on your page. Then paste the film's Vimeo link here. <strong>YouTube:</strong> set it to <strong>Unlisted</strong> (Private videos can't play
                  on your page). An unlisted link plays anywhere it's shared, so it's less protected.
                </>
              ),
            })}
            {field("trailer_url", "Trailer link (YouTube or Vimeo)", { placeholder: "https://youtube.com/watch?v=…" })}
            <TestScreening
              film={film}
              linkChanged={(form.vimeo_url || "").trim() !== (film.vimeo_url || "")}
              checked={!!form.playback_confirmed_at}
              // Keep the original date if it was already ticked; "1" tells the server it's newly ticked.
              onCheck={(on) => set("playback_confirmed_at")(on ? film.playback_confirmed_at || "1" : "")}
              required={film.status === "draft"}
            />
            <div className="pwyw" id="sec-rights">
              <label className="pwyw-toggle">
                <input
                  type="checkbox"
                  name="rights_confirmed_at"
                  aria-required="true"
                  checked={!!form.rights_confirmed_at}
                  // Keep the original date if it was already ticked; "1" tells the server it's newly ticked.
                  onChange={(e) => set("rights_confirmed_at")(e.target.checked ? film?.rights_confirmed_at || "1" : "")}
                />
                <span>
                  <strong>I own or control all the rights needed to sell and stream this film</strong> (required)
                  <span className="hint">
                    Including the music, footage, artwork and anything else in it, for viewers in every country where it's
                    offered. You're responsible for these rights, as set out in our{" "}
                    <a href={`${import.meta.env.BASE_URL}terms/`} target="_blank" rel="noopener">
                      Terms
                    </a>
                    .
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Site design</legend>
            <p className="fieldset-hint">Pick your watch page's colors. We'll match the rest of the design to your poster during setup.</p>
            <div className="design">
              <div className="colors">
                {COLORS.map(([k, label, hint]) => (
                  <ColorField key={k} label={label} hint={hint} value={form[k]} fallback={COLOR_DEFAULTS[k]} onChange={set(k)} error={errors[k]} />
                ))}
              </div>
              <DesignPreview form={form} />
            </div>
            <div className="pwyw">
              <label className="pwyw-toggle">
                <input type="checkbox" checked={!!form.hide_title} onChange={(e) => set("hide_title")(e.target.checked ? "1" : "")} />
                <span>
                  <strong>Hide the title on the banner</strong>
                  <span className="hint">
                    For a banner that already shows your title. The banner appears as a plain image, without the title, the one-line
                    description, or the dark fade behind them.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset id="sec-address">
            <legend>Web address</legend>
            <AddressFields filmId={film.id} title={form.title} sub={form.subdomain} onSub={set("subdomain")} errors={errors} />
          </fieldset>

          <fieldset id="sec-prices">
            <legend>Prices</legend>
            <p className="fieldset-hint">
              Turn on any mix of renting, buying and donations. Or leave them all off and use the Tip jar below (Venmo,
              PayPal or Zelle, and free viewing if you like): no Stripe needed.
            </p>
            <section className="stripe-options" aria-labelledby="stripe-options-h">
            <h3 id="stripe-options-h">Stripe Checkout Options</h3>
            <p className="stripe-options-hint">Paid through Stripe into your own account. Any of these means you'll connect Stripe before going live.</p>
            <div className="pwyw">
              <label className="pwyw-toggle">
                <input
                  type="checkbox"
                  checked={!!form.rent_enabled}
                  onChange={(e) => set("rent_enabled")(e.target.checked ? "1" : "")}
                />
                <span>
                  <strong>Rent</strong>
                  <span className="hint">Viewers pay once to watch for a limited time.</span>
                </span>
              </label>
              {form.rent_enabled && (
                <>
                  <div className="row-2">
                    {field("rent_price", "Rent price", { prefix: "$", inputMode: "decimal", placeholder: "4.99" })}
                  </div>
                  <div className="row-2">
                    {field("rental_days", "Days to start watching", { inputMode: "numeric", placeholder: "30" })}
                    {field("rental_watch_days", "Days to finish once started", { inputMode: "numeric", placeholder: "3" })}
                  </div>
                </>
              )}
            </div>

            <div className="pwyw">
              <label className="pwyw-toggle">
                <input
                  type="checkbox"
                  checked={!!form.buy_enabled}
                  onChange={(e) => set("buy_enabled")(e.target.checked ? "1" : "")}
                />
                <span>
                  <strong>Buy</strong>
                  <span className="hint">Viewers pay once and can watch whenever they like.</span>
                </span>
              </label>
              {form.buy_enabled && (
                <div className="row-2">
                  {field("buy_price", "Buy price", { prefix: "$", inputMode: "decimal", placeholder: "14.99" })}
                </div>
              )}
            </div>

            <div className="pwyw">
              <label className="pwyw-toggle">
                <input
                  type="checkbox"
                  checked={!!form.pwyw_enabled}
                  onChange={(e) => set("pwyw_enabled")(e.target.checked ? "1" : "")}
                />
                <span>
                  <strong>Accept donations</strong>
                  <span className="hint">Viewers choose the amount, from your minimum up. It goes through Stripe like any sale and unlocks the film.</span>
                </span>
              </label>
              {form.pwyw_enabled && (
                <>
                  <div className="row-2">
                    {field("pwyw_min", "Minimum", { prefix: "$", inputMode: "decimal", placeholder: "0.99", hint: "At least $0.99." })}
                    {field("pwyw_suggested", "Suggested amount (optional)", { prefix: "$", inputMode: "decimal", placeholder: "5.00", hint: "Filled in for viewers to start from." })}
                  </div>
                  <p className="pwyw-label">What it unlocks</p>
                  <Choice
                    name="pwyw_access"
                    value={form.pwyw_access}
                    onChange={set("pwyw_access")}
                    options={[
                      ["rent", `A rental (${form.rental_days || "30"} days to start, ${form.rental_watch_days || "3"} days to finish)`],
                      ["buy", "Theirs to keep, like a purchase"],
                    ]}
                  />
                  {!form.rent_enabled && form.pwyw_access === "rent" && (
                    <div className="row-2">
                      {field("rental_days", "Days to start watching", { inputMode: "numeric", placeholder: "30" })}
                      {field("rental_watch_days", "Days to finish once started", { inputMode: "numeric", placeholder: "3" })}
                    </div>
                  )}
                </>
              )}
            </div>
            </section>
          </fieldset>

          <fieldset>
            <legend>Tip jar</legend>
            <p className="fieldset-hint">
              Optional. Adds a "Support the filmmaker" button under your prices. Tips go straight to you outside our checkout, so
              we take no fee, and a tip doesn't unlock the film. Use accounts that can take payments from the public (for Venmo,
              a business profile).
            </p>
            {field("tip_venmo", "Venmo username", { prefix: "@", placeholder: "Jane-Filmmaker" })}
            {field("tip_paypal", "PayPal.Me name", { prefix: "paypal.me/", placeholder: "janefilms" })}
            {field("tip_zelle", "Zelle email or phone", { placeholder: "jane@example.com", hint: "Zelle has no payment links, so viewers see this and send from their bank's app." })}
            <div className="pwyw">
              <label className="pwyw-toggle">
                <input
                  type="checkbox"
                  checked={!!form.free_watch}
                  onChange={(e) => set("free_watch")(e.target.checked ? "1" : "")}
                />
                <span>
                  <strong>Allow the film to be watched for free</strong>
                  <span className="hint">
                    Anyone can watch without paying. Rent, Buy and donations stay available if they're on, and bonus features still
                    come only with a rental or purchase. Shows under Free/Donate in Browse.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Browse</legend>
            <div className="pwyw browse">
              <label className="pwyw-toggle">
                <input
                  type="checkbox"
                  checked={!!form.discoverable}
                  onChange={(e) => set("discoverable")(e.target.checked ? "1" : "")}
                />
                <span>
                  <strong>List my film in watchmyfilm Browse.</strong>
                  <span className="hint">
                    Optional, and off unless you turn it on. Viewers browsing {CLUB_DOMAIN} can find yours there. Tags help the
                    right viewers find it. You can change this any time, even after your film is live.
                  </span>
                </span>
              </label>
              {form.discoverable && (
                <TagPicker
                  tags={tags}
                  disabled={false}
                  error={errors.tags}
                  onChange={(t) => {
                    setTags(t);
                    setSaveState("idle");
                  }}
                />
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend>Credits</legend>
            <p className="fieldset-hint">Add as many people and roles as you like. Empty boxes are skipped when you save.</p>
            <CreditsEditor
              credits={credits}
              error={errors.credits}
              onChange={(c) => {
                setCredits(c);
                setSaveState("idle");
              }}
            />
          </fieldset>

          <fieldset>
            <legend>Bonus features</legend>
            <p className="fieldset-hint">
              Extra videos that come with a rental or a purchase, such as a director Q&amp;A, deleted scenes or a making-of. Add up to{" "}
              {BONUS_MAX} for each. Use Vimeo links set up like your film, or YouTube. Leave a section empty if it has no extras.
            </p>
            {errors.bonus && <p className="field-err" role="alert">{errors.bonus}.</p>}
            {(["rent", "buy"] as const).map((kind) => (
              <BonusEditor
                key={kind}
                kind={kind}
                value={bonus[kind]}
                onChange={(v) => {
                  setBonus((b) => ({ ...b, [kind]: v }));
                  setSaveState("idle");
                }}
              />
            ))}
          </fieldset>

          <fieldset>
            <legend>Contact</legend>
            <div className="row-2">
              {field("contact_name", "Your name")}
              {field("contact_phone", "Phone (optional)", { type: "tel" })}
            </div>
            {field("notes", "Anything we should know?", { multiline: 3 })}
          </fieldset>

          <fieldset id="sec-ai">
            <legend>Generative AI</legend>
            <p className="ai-question" id="ai-used-q">
              <strong>Was generative AI used in making this film?</strong>{film.status === "draft" && " (required)"}
            </p>
            <p className="fieldset-hint">
              For example AI-generated images, video, voices, music or script. Editing tools like noise reduction or
              auto-captions don't count.
            </p>
            <Choice
                labelledBy="ai-used-q"
                name="ai_used"
                value={form.ai_used}
                onChange={set("ai_used")}
                options={[
                  ["yes", "Yes, generative AI was used"],
                  ["no", "No generative AI was used"],
                ]}
              />
            {errors.ai_used && <p className="field-err" role="alert">{errors.ai_used}.</p>}
            {form.ai_used === "yes" &&
              field("ai_use_notes", film.status === "draft" ? "How was it used? (required)" : "How was it used?", {
                multiline: 3,
                maxLength: 1000,
                placeholder: "e.g. AI-generated background music in two scenes; the narrator's voice was cloned with permission.",
              })}
          </fieldset>

          {(
            <div className="save-bar">
              <button className="btn" disabled={saveState === "saving" || !dirty} aria-busy={saveState === "saving"}>
                {saveState === "saving" ? "Saving…" : "Save changes"}
              </button>
              <span className="save-state" role="status">
                {saveState === "saved" && !dirty && "Saved"}
                {dirty && saveState !== "saving" && "Unsaved changes"}
              </span>
              {saveState === "error" && <span className="field-err" role="alert">{saveError}</span>}
            </div>
          )}

          <DeleteFilm film={film} />
        </form>

        <SetupCard film={film} meta={meta} dirty={dirty} save={save} onChange={onChange} stripe={stripe} onStripe={onStripe} />
      </div>
    </div>
  );
}

// "Add these first": each missing item jumps to its field (or section), focuses it and flashes it briefly.
// Keyed by the labels server/src/films.js sends in film.missing (LABELS there).
// One-line description: short enough to sit on one line under the title and in Browse (server allows the same).
const LOGLINE_MAX = 120;

const MISSING_TARGETS: Record<string, string> = {
  Title: '[name="title"]',
  Synopsis: '[name="synopsis"]',
  Poster: "#img-poster",
  "Wide image": "#img-still",
  "Film link (Vimeo or YouTube)": '[name="vimeo_url"]',
  "Web address": "#sec-address",
  "Confirm you have the rights to sell this film": "#sec-rights",
  "Say whether generative AI was used": "#sec-ai",
  "Check your film plays from the test screening": "#sec-playback",
  "Describe how generative AI was used": '[name="ai_use_notes"]',
};
const targetFor = (label: string) => MISSING_TARGETS[label] || (/price|free viewing|tip jar/i.test(label) ? "#sec-prices" : null);

function jumpTo(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = el.matches("input, textarea, select") ? el : el.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select, button");
  focusable?.focus({ preventScroll: true });
  const box = el.closest(".field, .poster-up, fieldset") || el;
  box.classList.remove("jump-flash");
  void (box as HTMLElement).offsetWidth; // restart the animation if clicked twice
  box.classList.add("jump-flash");
  setTimeout(() => box.classList.remove("jump-flash"), 1600);
}

function MissingList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((m) => {
        const target = targetFor(m);
        return (
          <li key={m}>
            {target ? (
              <button type="button" className="link-btn missing-link" onClick={() => jumpTo(target)}>
                {m}
              </button>
            ) : (
              m
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Delete a film, after typing its title. The server only marks it deleted (kept for the record; admins still see it)
// and refuses films with sales (buyers keep access).
// Not a <form> of its own (it sits inside the film form), so Enter in the box doesn't submit anything.
function DeleteFilm({ film }: { film: Film }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const title = film.title.trim();
  const matches = typed.trim().toLowerCase() === title.toLowerCase();

  async function del() {
    setBusy(true);
    setError("");
    try {
      await api(`/films/${film.id}`, { method: "DELETE", body: { confirm_title: typed } });
      location.assign(`${import.meta.env.BASE_URL}dashboard/`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <p className="delete-film-open">
        <button type="button" className="link-btn" onClick={() => setOpen(true)}>
          Delete this film…
        </button>
      </p>
    );
  }
  return (
    <section className="delete-film" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Delete this film</h2>
      <p>
        This permanently deletes <strong>{title}</strong>: its details, images and settings
        {film.status === "live" ? ", and its watch page stops working" : ""}. It can't be undone. Your Stripe account isn't
        affected.
      </p>
      <p className="small-print">
        Films that have been rented or bought can't be deleted, because those viewers keep access. Hide the film instead,
        or email us.
      </p>
      <label htmlFor={id}>Type the film's title to confirm</label>
      <input
        id={id}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        placeholder={title}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="delete-film-actions">
        <button type="button" className="btn btn-danger" onClick={del} disabled={!matches || busy}>
          {busy ? "Deleting…" : "Delete film"}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError("");
          }}
        >
          Cancel
        </button>
      </div>
      {error && <p className="field-err" role="alert">{error}</p>}
    </section>
  );
}

type Check = { available: boolean; reason?: string; suggestion?: string | null; name?: string };

// Asks the server whether an address is free, a moment after typing stops.
function useAddressCheck(param: "subdomain" | "domain", value: string, filmId: number, skip: boolean) {
  const [check, setCheck] = useState<Check | null>(null);
  useEffect(() => {
    if (skip) return setCheck(null);
    const t = setTimeout(() => {
      api<Check>(`/films/address-check?${param}=${encodeURIComponent(value.trim())}&film=${filmId}`)
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 350);
    return () => clearTimeout(t);
  }, [param, value, filmId, skip]);
  return check;
}

// Every film gets a unique address on our domain. With their own domain, that address is what their DNS points at.
// The film's address: <name>.indiefilm.club. Filmmakers who want their own (watch.yourfilm.com) forward it here at
// their own domain provider; we don't host other domains (no extra cost, setup or support on our side).
function AddressFields({ filmId, title, sub, onSub, disabled, errors }: {
  filmId: number; title: string; sub: string;
  onSub: (v: string) => void; disabled?: boolean; errors: Record<string, string>;
}) {
  const subId = useId();
  const subCheck = useAddressCheck("subdomain", sub, filmId, !!disabled);
  const full = `${sub.trim().toLowerCase() || "yourfilm"}.${CLUB_DOMAIN}`;

  let status: ReactNode = null;
  if (errors.subdomain) status = <p className="field-err">Address {errors.subdomain}.</p>;
  else if (subCheck?.available) status = <p className="addr-ok">✓ {subCheck.name}.{CLUB_DOMAIN} is yours if you save it.</p>;
  else if (subCheck && (subCheck.reason || subCheck.suggestion))
    status = (
      <p className={subCheck.reason ? "field-err" : "hint"}>
        {subCheck.reason || "Pick an address for your film."}{" "}
        {subCheck.suggestion && !disabled && (
          <button type="button" className="link-btn" onClick={() => onSub(subCheck.suggestion!)}>
            Use {subCheck.suggestion}.{CLUB_DOMAIN}
          </button>
        )}
      </p>
    );

  return (
    <>
      <div className={`field${errors.subdomain || (subCheck && !subCheck.available && subCheck.reason) ? " has-err" : ""}`}>
        <label htmlFor={subId}>Address</label>
        <div className="affix">
          <input
            id={subId}
            value={sub}
            placeholder={title ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "yourfilm"}
            disabled={disabled}
            maxLength={42}
            spellCheck={false}
            autoCapitalize="none"
            onChange={(e) => onSub(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          />
          <span>.{CLUB_DOMAIN}</span>
        </div>
        <div aria-live="polite">{status}</div>
        <p className="hint">Each film needs its own. Letters, numbers and dashes.</p>
        <p className="hint">
          <strong>Want your own address too,</strong> like watch.yourfilm.com? At your domain provider (Squarespace,
          Namecheap, GoDaddy, Cloudflare…), set up a <strong>forward</strong> (sometimes called a URL redirect) from it to{" "}
          <strong>https://{full}</strong>. It's free with most providers. Afterwards, check that both http:// and
          https:// versions of your address forward.
        </p>
      </div>
    </>
  );
}

// Up to TAGS_MAX tags: tick common ones from the checklist, or type to search the full list (or add your own).
function TagPicker({ tags, onChange, disabled, error }: { tags: string[]; onChange: (t: string[]) => void; disabled?: boolean; error?: string }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [note, setNote] = useState("");
  const full = tags.length >= TAGS_MAX;
  const has = (t: string) => tags.some((x) => x.toLowerCase() === t.toLowerCase());
  const suggestions = suggestTags(query, tags);
  const typed = cleanTag(query);
  // Offer what they typed as its own tag when it isn't already a suggestion.
  const options = typed && !has(typed) && !suggestions.some((s) => s.toLowerCase() === typed.toLowerCase()) ? [...suggestions, typed] : suggestions;
  const open = options.length > 0 && !full;

  function add(raw: string) {
    const t = cleanTag(raw);
    if (!t) return;
    if (has(t)) return setNote(`"${t}" is already added.`);
    if (full) return setNote(`You can add up to ${TAGS_MAX} tags.`);
    if (t.length > 32) return setNote("Tags can be up to 32 characters.");
    if (!TAG_RE.test(t)) return setNote("Tags can use letters, numbers, spaces and & ' - / . +");
    onChange([...tags, t]);
    setQuery("");
    setActive(0);
    setNote("");
  }
  const remove = (t: string) => {
    onChange(tags.filter((x) => x !== t));
    setNote("");
  };

  return (
    <div className="tags">
      <div className="tags-head">
        <p className="pwyw-label" id={`${id}-label`}>Tags</p>
        <p className={`tags-count${full ? " is-full" : ""}`} aria-live="polite">
          {tags.length} of {TAGS_MAX}
        </p>
      </div>

      {tags.length > 0 ? (
        <ul className="tag-chips" aria-label="Added tags">
          {tags.map((t) => (
            <li key={t}>
              {t}
              <button type="button" onClick={() => remove(t)} disabled={disabled} aria-label={`Remove ${t}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tags-empty">No tags yet. Tick some below or type to search.</p>
      )}

      <div className="tag-combo">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-labelledby={`${id}-label`}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
          placeholder={full ? "Remove a tag to add another" : "Type a tag, like documentary or climate"}
          value={query}
          disabled={disabled || full}
          maxLength={40}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setNote("");
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && open) {
              e.preventDefault();
              setActive((a) => (a + 1) % options.length);
            } else if (e.key === "ArrowUp" && open) {
              e.preventDefault();
              setActive((a) => (a - 1 + options.length) % options.length);
            } else if (e.key === "Enter" || e.key === ",") {
              // Enter would otherwise submit (save) the whole form.
              e.preventDefault();
              add(open ? options[active] : query);
            } else if (e.key === "Escape") {
              setQuery("");
            } else if (e.key === "Backspace" && !query && tags.length) {
              remove(tags[tags.length - 1]);
            }
          }}
        />
        {open && (
          <ul className="tag-options" id={`${id}-list`} role="listbox">
            {options.map((t, i) => (
              <li
                key={t}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  add(t);
                  inputRef.current?.focus();
                }}
              >
                {i === suggestions.length ? <>Add "{t}"</> : t}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(note || error) && (
        <p className="field-err" role="alert">
          {note || `Tags ${error}.`}
        </p>
      )}

      <div className="tag-checklist">
        {QUICK_TAGS.map(([group, list]) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            {list.map((t) => {
              const on = has(t);
              return (
                <label key={t} className={`tag-check${on ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled || (!on && full)}
                    onChange={() => (on ? remove(tags.find((x) => x.toLowerCase() === t.toLowerCase())!) : add(t))}
                  />
                  {t}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </div>
  );
}

function BonusEditor({ kind, value, onChange, disabled }: { kind: "rent" | "buy"; value: BonusSet; onChange: (v: BonusSet) => void; disabled?: boolean }) {
  const descId = useId();
  const noun = kind === "rent" ? "rentals" : "purchases";
  const box = kind === "rent" ? "Rent" : "Buy";
  const setVideo = (i: number, patch: Partial<BonusSet["videos"][number]>) =>
    onChange({ ...value, videos: value.videos.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  return (
    <section className="bonus-set" aria-label={`Bonus features for ${noun}`}>
      <h3>Included with {noun}</h3>

      <div className="field">
        <label htmlFor={descId}>How it reads on the {box} box</label>
        <textarea
          id={descId}
          rows={2}
          maxLength={500}
          value={value.description}
          disabled={disabled}
          placeholder={kind === "rent" ? "e.g. Includes a 20-minute director Q&A" : "e.g. Bonus features: live Q&A recordings with the director and cast"}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
        <p className="hint">Shown with a checkmark on the {box} box of your watch page. Keep it to a sentence or two.</p>
      </div>

      {value.videos.length > 0 && (
        <ol className="bonus-videos">
          {value.videos.map((v, i) => (
            <li key={i} className="bonus-video">
              <span className="bonus-num" aria-hidden="true">{i + 1}</span>
              <input
                aria-label={`Bonus video ${i + 1} title (${noun})`}
                value={v.title}
                placeholder="Title, e.g. Director Q&A"
                maxLength={200}
                disabled={disabled}
                onChange={(e) => setVideo(i, { title: e.target.value })}
              />
              <input
                aria-label={`Bonus video ${i + 1} link (${noun})`}
                value={v.url}
                placeholder="https://vimeo.com/…"
                inputMode="url"
                disabled={disabled}
                onChange={(e) => setVideo(i, { url: e.target.value })}
              />
              {!disabled && (
                <button
                  type="button"
                  className="remove-btn"
                  aria-label={`Remove bonus video ${i + 1}`}
                  onClick={() => onChange({ ...value, videos: value.videos.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {!disabled &&
        (value.videos.length < BONUS_MAX ? (
          <button type="button" className="add-btn" onClick={() => onChange({ ...value, videos: [...value.videos, { title: "", url: "" }] })}>
            + Add a video ({value.videos.length} of {BONUS_MAX})
          </button>
        ) : (
          <p className="hint">That's the maximum of {BONUS_MAX} videos.</p>
        ))}
    </section>
  );
}

function CreditsEditor({ credits, onChange, disabled, error }: { credits: Credit[]; onChange: (c: Credit[]) => void; disabled?: boolean; error?: string }) {
  const update = (i: number, c: Credit) => onChange(credits.map((x, j) => (j === i ? c : x)));
  const isDefault = (role: string) => DEFAULT_ROLES.some((r) => r.toLowerCase() === role.toLowerCase());

  return (
    <div className="credits">
      {credits.map((c, i) => {
        const custom = !isDefault(c.role) || credits.findIndex((x) => x.role.toLowerCase() === c.role.toLowerCase()) !== i;
        return (
          <div className="credit-role" key={i}>
            {custom ? (
              <div className="credit-role-head">
                <input
                  aria-label="Role"
                  value={c.role}
                  placeholder="Role, e.g. Editor"
                  maxLength={80}
                  disabled={disabled}
                  onChange={(e) => update(i, { ...c, role: e.target.value })}
                />
                {!disabled && (
                  <button type="button" className="link-btn" onClick={() => onChange(credits.filter((_, j) => j !== i))}>
                    Remove role
                  </button>
                )}
              </div>
            ) : (
              <p className="credit-role-name">{c.role}</p>
            )}
            {c.names.map((n, k) => (
              <div className="credit-name" key={k}>
                <input
                  aria-label={`${c.role || "Role"} name ${k + 1}`}
                  value={n}
                  placeholder={c.role === "Cast" ? "Name (or Name as Character)" : "Name"}
                  maxLength={200}
                  disabled={disabled}
                  onChange={(e) => update(i, { ...c, names: c.names.map((x, m) => (m === k ? e.target.value : x)) })}
                />
                {!disabled && c.names.length > 1 && (
                  <button
                    type="button"
                    className="remove-btn"
                    aria-label={`Remove ${n || "this name"}`}
                    onClick={() => update(i, { ...c, names: c.names.filter((_, m) => m !== k) })}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {!disabled && (
              <button type="button" className="add-btn" onClick={() => update(i, { ...c, names: [...c.names, ""] })}>
                + Add {c.role ? `another ${/s$/i.test(c.role) || c.role === "Cast" ? "name" : c.role.toLowerCase()}` : "a name"}
              </button>
            )}
          </div>
        );
      })}
      {!disabled && (
        <button type="button" className="btn btn-red btn-small" onClick={() => onChange([...credits, { role: "", names: [""] }])}>
          + Add a role
        </button>
      )}
      {error && <p className="field-err" role="alert">Credits {error}.</p>}
    </div>
  );
}


// What the watch page uses when a color is left blank.

const COLORS: [ColorKey, string, string][] = [
  ["color_background", "Background", "Behind everything on the page"],
  ["color_primary", "Primary", "Title and headings"],
  ["color_secondary", "Secondary", "Descriptions and smaller text"],
  ["color_button", "Button", "Rent and buy buttons"],
];

// ----- Color picker -----
// Our own small picker instead of <input type="color">: in Firefox on macOS that opens the system Colors window,
// which stays open when you click elsewhere. This one is a panel on the page that closes on an outside click or Esc.

const HEX6 = /^#[0-9a-f]{6}$/i;

function hexToHsv(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

function hsvToHex(h: number, s: number, v: number) {
  const f = (k: number) => {
    const x = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(x, 4 - x, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// Quick picks: the site's palette and a few neutrals.
const SWATCHES = ["#000000", "#1f1d1b", "#ede8df", "#ffffff", "#a39e95", "#fceb7e", "#8c1c3a", "#b8405c", "#1c3a5e", "#2f5d3a"];

function ColorPopover({ value, onChange, onClose, label }: { value: string; onChange: (v: string) => void; onClose: () => void; label: string }) {
  const [hsv, setHsv] = useState(() => hexToHsv(HEX6.test(value) ? value : "#000000"));
  const area = useRef<HTMLDivElement>(null);
  const [h, s, v] = hsv;

  const set = (next: [number, number, number]) => {
    setHsv(next);
    onChange(hsvToHex(...next));
  };

  // Drag in the square: left-right is saturation, top-bottom is brightness.
  function pick(e: React.PointerEvent<HTMLDivElement>) {
    const r = area.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    set([h, x, 1 - y]);
  }

  return (
    <div className="cp-pop" role="dialog" aria-label={`${label} color`}>
      <div
        ref={area}
        className="cp-area"
        style={{ backgroundColor: `hsl(${h} 100% 50%)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => e.buttons && pick(e)}
      >
        <span className="cp-dot" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: hsvToHex(h, s, v) }} />
      </div>
      <input
        type="range"
        className="cp-hue"
        min={0}
        max={359}
        value={Math.round(h)}
        aria-label="Hue"
        onChange={(e) => set([Number(e.target.value), s || 0.8, v || 0.8])}
      />
      <div className="cp-swatches">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            className="cp-swatch"
            style={{ background: c }}
            aria-label={c}
            onClick={() => {
              setHsv(hexToHsv(c));
              onChange(c);
            }}
          />
        ))}
      </div>
      <button type="button" className="link-btn cp-done" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

function ColorField({ label, hint, value, fallback, onChange, disabled, error }: {
  label: string; hint: string; value: string; fallback: string; onChange: (v: string) => void; disabled?: boolean; error?: string;
}) {
  const id = useId();
  const shown = HEX6.test(value) ? value : fallback;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const swatch = useRef<HTMLButtonElement>(null);

  // Close on a click anywhere outside the field, or on Esc (focus goes back to the swatch).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        swatch.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`color-field${error ? " has-err" : ""}`} ref={wrap}>
      <button
        ref={swatch}
        type="button"
        id={id}
        className="cp-swatch-btn"
        style={{ background: shown }}
        disabled={disabled}
        aria-expanded={open}
        aria-describedby={`${id}-h`}
        aria-label={`${label}: ${shown}. Choose a color`}
        onClick={() => setOpen((o) => !o)}
      />
      {open && <ColorPopover value={shown} label={label} onChange={onChange} onClose={() => setOpen(false)} />}
      <div className="color-text">
        <label htmlFor={id}>{label}</label>
        <input
          aria-label={`${label} hex code`}
          className="hex"
          value={value}
          placeholder={fallback}
          maxLength={7}
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value.trim())}
        />
        <p id={`${id}-h`} className={error ? "field-err" : "hint"}>{error ? `${label} ${error}.` : hint}</p>
      </div>
    </div>
  );
}


// The Rent (or Buy) box from the watch page, drawn with the colors being picked. Uses the watch page's own styles.
function DesignPreview({ form }: { form: FormState }) {
  const buy = form.buy_enabled ? form.buy_price.trim() : "";
  const rent = (form.rent_enabled ? form.rent_price.trim() : "") || (buy ? "" : "4.99");
  const days = form.rental_days.trim() || "30";
  const watchDays = form.rental_watch_days.trim() || "3";
  return (
    <div className="design-preview sample" style={pageTheme(form)} aria-label="Preview of your colors on your watch page's sales box">
      <div className="s-card dp-card" aria-hidden="true">
        {rent ? (
          <>
            <h3>Rent for ${rent}</h3>
            <p className="s-sub">{days} days to start watching</p>
            <div className="s-box">
              <p className="s-box-title">Viewing period</p>
              <p>Start watching within {days} days</p>
              <p>{watchDays} {watchDays === "1" ? "day" : "days"} to finish once started</p>
            </div>
            <span className="s-btn">▶ Rent Now</span>
          </>
        ) : (
          <>
            <h3>Buy for ${buy}</h3>
            <p className="s-sub">Lifetime access via this website</p>
            <div className="s-box">
              <ul className="s-checks">
                <li>Unlimited access to {form.title.trim() || "your film"}</li>
              </ul>
            </div>
            <span className="s-btn">Buy Now</span>
          </>
        )}
        <p className="s-fine">Secure payment powered by Stripe</p>
      </div>
    </div>
  );
}

// Progress across the top. A step with something to do (or read) scrolls to it when clicked.
// Rent, buy or donations go through Stripe, so they need the filmmaker's Stripe details. Free viewing alone doesn't.
// Matches sellsWithStripe in server/src/films.js.
const sellsWithStripe = (f: Film) => !!(f.rent_price_cents || f.buy_price_cents || f.pwyw_enabled);

function Steps({ film, stripe, upfront }: { film: Film; stripe: ConnectInfo | null; upfront: boolean }) {
  const detailsDone = film.missing.length === 0;
  const feeDone = film.setup_status !== "unpaid";
  const reviewDone = film.status === "approved" || film.status === "live";
  const live = film.status === "live";
  const needsStripe = sellsWithStripe(film);
  const ready = !needsStripe || !!stripe?.canAcceptPayments;
  const stripeNote = !reviewDone || live ? "" : ready ? "Ready: go live whenever you want" : "Connect Stripe, then go live";
  const steps: { label: string; done: boolean; note?: string; target: string }[] = [
    { label: "Film details", done: detailsDone, note: detailsDone ? "" : `${film.missing.length} left`, target: "film-form" },
    ...(upfront ? [{ label: "Setup fee", done: feeDone, target: "setup-card" }] : []),
    { label: "Review", done: reviewDone, note: film.status === "changes_requested" ? "Changes requested" : "", target: "setup-card" },
    {
      label: needsStripe ? "Connect Stripe and go live" : "Go live",
      done: live,
      note: stripeNote,
      target: film.status === "approved" ? (ready ? "go-live" : "get-paid") : needsStripe && feeDone && !live ? "get-paid" : "setup-card",
    },
  ];
  const current = steps.findIndex((st) => !st.done);
  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };
  return (
    <ol className="progress">
      {steps.map((st, i) => (
        <li key={st.label} className={st.done ? "done" : i === current ? "current" : ""}>
          <button type="button" className="progress-btn" onClick={() => go(st.target)} aria-current={i === current ? "step" : undefined}>
            <span className="progress-num">{st.done ? "✓" : i + 1}</span>
            <span className="progress-text">
              {st.label}
              {st.note && <span className="progress-note">{st.note}</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function SetupCard({ film, meta, dirty, save, onChange, stripe, onStripe }: { film: Film; meta: FilmsResponse; dirty: boolean; save: () => Promise<boolean>; onChange: (f: Film) => void; stripe: ConnectInfo | null; onStripe: (c: ConnectInfo) => void }) {
  const [busy, setBusy] = useState<"" | "pay" | "code" | "submit" | "resubmit" | "live" | "visibility">("");
  const needsStripe = sellsWithStripe(film);
  const ready = !needsStripe || !!stripe?.canAcceptPayments;
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const codeId = useId();
  const fee = dollars(meta.setupFeeCents).replace(".00", "");

  async function run(kind: "pay" | "code" | "submit" | "resubmit" | "live" | "visibility", fn: () => Promise<void>) {
    setError("");
    setBusy(kind);
    try {
      if (dirty && !(await save())) throw new Error("Fix the highlighted fields first.");
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const pay = () =>
    run("pay", async () => {
      const r = await api<{ url: string }>(`/films/${film.id}/checkout`, { body: {} });
      location.assign(r.url);
      await new Promise(() => {}); // keep the button busy while the browser leaves
    });

  const redeem = (e: FormEvent) => {
    e.preventDefault();
    run("code", async () => {
      const r = await api<{ film: Film }>(`/films/${film.id}/redeem`, { body: { code } });
      onChange(r.film);
    });
  };

  // Nothing up front: straight to review.
  const submit = () =>
    run("submit", async () => {
      const r = await api<{ film: Film }>(`/films/${film.id}/submit`, { body: {} });
      onChange(r.film);
    });

  const surcharge = dollars(meta.setupSurchargeCents).replace(".00", "");

  const goLive = () =>
    run("live", async () => {
      const r = await api<{ film: Film }>(`/films/${film.id}/go-live`, { body: {} });
      onChange(r.film);
    });

  const setHidden = (hidden: boolean) =>
    run("visibility", async () => {
      if (hidden && !confirm("Hide your watch page? Visitors will see a holding page, and nobody can rent, buy or watch until you show it again.")) return;
      const r = await api<{ film: Film }>(`/films/${film.id}/visibility`, { body: { hidden } });
      onChange(r.film);
    });

  const resubmit = () =>
    run("resubmit", async () => {
      const r = await api<{ film: Film }>(`/films/${film.id}/resubmit`, { body: {} });
      onChange(r.film);
    });

  let body: ReactNode;
  if (film.status === "changes_requested") {
    body = (
      <>
        <h2>We need a few changes</h2>
        {film.admin_note && <blockquote className="admin-note">{film.admin_note}</blockquote>}
        <p>Update the details, then send it back to us.</p>
        <button type="button" className="btn" onClick={resubmit} disabled={!!busy || film.missing.length > 0}>
          {busy === "resubmit" ? "Sending…" : "Send back for review"}
        </button>
      </>
    );
  } else if (film.setup_status !== "unpaid") {
    const msgs: Record<string, [string, string]> = {
      in_review: ["In review", "We're checking your film and its details. We'll email you when it's approved, usually within two business days."],
      approved: [
        "Approved",
        ready
          ? "Your film passed review. Your page goes public when you say so: check the preview, then go live."
          : "Your film passed review. Connect Stripe below, then you can go live whenever you're ready.",
      ],
      live: film.hidden
        ? ["Hidden", "Visitors to your address see a holding page. Nobody can rent, buy or watch until you show it again."]
        : ["Live", "Your watch page is live. Share it!"],
    };
    const [h, p] = msgs[film.status] || msgs.in_review;
    body = (
      <>
        {film.setup_status !== "deferred" && (
          <p className="setup-paid">✓ Setup fee {film.setup_status === "waived" ? "waived" : "paid"}</p>
        )}
        <h2>{h}</h2>
        <p>{p}</p>
        {film.admin_note && <blockquote className="admin-note">{film.admin_note}</blockquote>}
        {film.status === "approved" && (
          <div id="go-live" tabIndex={-1} className="go-live">
            <button type="button" className="btn setup-pay" onClick={goLive} disabled={!!busy || !ready}>
              {busy === "live" ? "Going live…" : "Go live"}
            </button>
            <p className="small-print">
              {!ready ? "Connect Stripe below first." : needsStripe ? "Your page becomes public and viewers can rent or buy." : "Your page becomes public and anyone can watch for free."}
            </p>
          </div>
        )}
        {film.status === "live" &&
          (film.hidden ? (
            <button type="button" className="btn setup-pay" onClick={() => setHidden(false)} disabled={!!busy}>
              {busy === "visibility" ? "Showing…" : "Show my page"}
            </button>
          ) : (
            <button type="button" className="link-btn go-offline" onClick={() => setHidden(true)} disabled={!!busy}>
              {busy === "visibility" ? "Hiding…" : "Hide my page (show a holding page)"}
            </button>
          ))}
      </>
    );
  } else if (!meta.setupUpfront) {
    const ready = film.missing.length === 0;
    body = (
      <>
        <h2>Send for review</h2>
        <p>
          We build your watch page, set up your address and Stripe, and review your film. Nothing to pay now: once you're
          selling, we add {surcharge} to our fee on each sale until the {fee} setup cost is covered. No monthly fee.
        </p>
        {!ready && (
          <div className="missing">
            <p>Add these first:</p>
            <MissingList items={film.missing} />
          </div>
        )}
        <button type="button" className="btn setup-pay" onClick={submit} disabled={!ready || !!busy}>
          {busy === "submit" ? "Sending…" : "Send for review"}
        </button>
      </>
    );
  } else {
    // Paying up front (SETUP_UPFRONT=1 on the server). Kept for later.
    const ready = film.missing.length === 0;
    body = (
      <>
        <h2>Setup fee</h2>
        <p className="setup-price">
          {fee} <span>one time</span>
        </p>
        <p>Covers building your watch page, setting up your address and Stripe, and our review. No monthly fee after this.</p>
        {!ready && (
          <div className="missing">
            <p>Add these first:</p>
            <MissingList items={film.missing} />
          </div>
        )}
        <button type="button" className="btn setup-pay" onClick={pay} disabled={!ready || !!busy || !meta.checkoutEnabled}>
          {busy === "pay" ? "Opening checkout…" : `Pay ${fee} and submit`}
        </button>
        {!meta.checkoutEnabled && <p className="small-print">Card payments aren't switched on yet. Use a code, or email us.</p>}
        <p className="small-print">Secure checkout by Stripe.</p>

        <form className="code-form" onSubmit={redeem}>
          <label htmlFor={codeId}>Have a code?</label>
          <div className="code-row">
            <input id={codeId} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} required />
            <button className="btn btn-red btn-small" disabled={!ready || !!busy || !code.trim()}>
              {busy === "code" ? "Checking…" : "Apply"}
            </button>
          </div>
        </form>
      </>
    );
  }

  // Once the fee is in, they can tell us where to be paid while we review.
  // Only films that sell through Stripe (rent, buy or donations) need it; free-only films skip this.
  // Live films always show it: the server won't turn on sales for a live film until Stripe is connected.
  const askStripe =
    film.setup_status !== "unpaid" &&
    (film.status === "live" || (needsStripe && (film.status === "in_review" || film.status === "approved" || film.status === "changes_requested")));

  return (
    <aside className="setup-card" id="setup-card" tabIndex={-1} aria-label="Setup">
      {body}
      {error && <p className="field-err" role="alert">{error}</p>}
      {askStripe && (
        <section className="setup-stripe" id="get-paid" tabIndex={-1} aria-label="Get paid">
          <h2>Get paid</h2>
          <p>
            Every sale goes straight to your own Stripe account.{" "}
            {film.status === "live"
              ? stripe?.canAcceptPayments
                ? "Your Stripe account is connected, so you can turn on Rent, Buy or donations any time."
                : "Connect it to start selling. Until then, viewers see only your free and tip-jar options."
              : film.status === "approved"
              ? "Connect it here before you go live." : "Connect it while we review your film, so you can go live as soon as it's approved."}
          </p>
          <ConnectStripe initial={stripe} onChange={onStripe} />
        </section>
      )}
    </aside>
  );
}

const IMAGE_KINDS = {
  poster: { label: "poster", empty: "No poster yet", hint: "Tall, 2:3. JPG, PNG or WebP, up to 10 MB.", url: (f: Film) => f.poster_url },
  still: { label: "wide image", empty: "No wide image yet", hint: "Wide, 16:9, ideally 1920 × 1080: a still or key art. JPG, PNG or WebP, up to 10 MB.", url: (f: Film) => f.still_url },
  banner: {
    label: "banner",
    empty: "No banner (optional)",
    hint: "Optional. Extra wide, 3:1, ideally 2400 × 800 px. It sits behind your title at the top of the page, so keep the important part in the middle and avoid text: the edges are trimmed on phones. Without one, we use your wide image. JPG, PNG or WebP, up to 10 MB.",
    url: (f: Film) => f.banner_url,
  },
};

function ImageUpload({ kind, film, onChange, disabled }: { kind: keyof typeof IMAGE_KINDS; film: Film; onChange: (f: Film) => void; disabled?: boolean }) {
  const k = IMAGE_KINDS[kind];
  const src = k.url(film);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("image", file);
    try {
      const r = await api<{ film: Film }>(`/films/${film.id}/${kind}`, { body });
      onChange(r.film);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="poster-up" id={`img-${kind}`}>
      {/* frame-<kind>, not a bare "poster": that class belongs to the home page's mock-up and would reshape this box. */}
      <div className={`poster-frame frame-${kind}`}>{src ? <img src={src} alt={`${film.title} ${k.label}`} /> : <span>{k.empty}</span>}</div>
      <div>
        <label htmlFor={id} className={`btn btn-red btn-small${disabled ? " is-disabled" : ""}`}>
          {busy ? "Uploading…" : src ? `Replace ${k.label}` : `Upload ${k.label}`}
        </label>
        <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" disabled={disabled || busy} onChange={(e) => onFile(e.target.files?.[0])} />
        <p className="small-print">{k.hint}</p>
        {error && <p className="field-err" role="alert">{error}</p>}
      </div>
    </div>
  );
}

function Field({ label, hint, error, value, onChange, disabled, type = "text", placeholder, multiline, prefix, suffix, inputMode, name, maxLength }: {
  label: string; hint?: ReactNode; error?: string; value: string; onChange: (v: string) => void; disabled?: boolean;
  type?: string; placeholder?: string; multiline?: number; prefix?: string; suffix?: string; inputMode?: "decimal" | "numeric";
  name?: string; // lets "Add these first" jump to the field
  maxLength?: number; // a character limit, with a counter by the label
}) {
  const id = useId();
  const common = { id, name, value, disabled, placeholder, maxLength, "aria-invalid": !!error, "aria-describedby": hint || error ? `${id}-d` : undefined };
  const left = maxLength ? maxLength - (value || "").length : null;
  return (
    <div className={`field${error ? " has-err" : ""}`}>
      <label htmlFor={id}>
        {label}
        {left != null && (
          <span className={`field-count${left <= 10 ? " is-low" : ""}`} aria-live="polite">
            {left} left
          </span>
        )}
      </label>
      {multiline ? (
        <textarea {...common} rows={multiline} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="affix">
          {prefix && <span>{prefix}</span>}
          <input {...common} type={type} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
          {suffix && <span>{suffix}</span>}
        </div>
      )}
      {(hint || error) && (
        <p id={`${id}-d`} className={error ? "field-err" : "hint"}>
          {error ? `${label} ${error}.` : hint}
        </p>
      )}
    </div>
  );
}

// "Test it behind the paywall": opens the film's test screening on indiefilm.club (the watch page as a paying viewer
// sees it, film playing, nobody charged), then the filmmaker ticks that it's visible and plays there. Only this
// account and our admins can view it. Uses the saved film link, so a changed link has to be saved first (saving a
// new link also unticks the box).
function TestScreening({ film, linkChanged, checked, onCheck, required }: { film: Film; linkChanged: boolean; checked: boolean; onCheck: (on: boolean) => void; required: boolean }) {
  const ready = !!film.vimeo_url && !linkChanged;
  return (
    <div className="pwyw test-screening" id="sec-playback">
      <p className="test-screening-head">
        <strong>Test it behind the paywall</strong>
        {required && " (required)"}
      </p>
      <p className="hint">
        Opens your watch page on indiefilm.club as a viewer sees it after paying, with your film in the player. Nobody is
        charged. Make sure the film appears and plays. If Vimeo says it can't play here, check the embed settings above.
      </p>
      {ready ? (
        <a className="btn btn-small" href={cross(screeningUrl(film.id))} target="_blank" rel="noopener">
          Open test screening ↗
        </a>
      ) : (
        <button type="button" className="btn btn-small" disabled>
          Open test screening ↗
        </button>
      )}
      <p className="hint test-screening-private">
        🔒 Only viewable when signed in to this account, and by our admins. No one else can watch it, even if they get
        the link.
      </p>
      {!ready && (
        <p className="hint">{film.vimeo_url ? "Save your new film link first, then test it." : "Add the link to your full film and save first."}</p>
      )}
      <label className="pwyw-toggle">
        <input type="checkbox" name="playback_confirmed_at" aria-required={required} checked={checked} disabled={!ready && !checked} onChange={(e) => onCheck(e.target.checked)} />
        <span>
          <strong>My film is visible and plays from the test screening link</strong>
          {required && " (required)"}
        </span>
      </label>
    </div>
  );
}

function Choice({ name, value, onChange, options, disabled, labelledBy }: { name: string; value: string; onChange: (v: string) => void; options: [string, string][]; disabled?: boolean; labelledBy?: string }) {
  return (
    <div className="choice" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map(([v, label]) => (
        <label key={v} className={value === v ? "on" : ""}>
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} disabled={disabled} />
          {label}
        </label>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AddFilm />
  </StrictMode>
);
