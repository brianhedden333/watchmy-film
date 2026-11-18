import { StrictMode, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { site } from "./config";
import { api, ApiError, dollars, getMe, type StripeInfo, type User } from "./api";
import { BONUS_MAX, COLOR_DEFAULTS, liveAddress, pageTheme, pillClass, STATUS_LABEL, statusLabel, type Bonus, type BonusSet, type ColorKey, type Credit, type Film, type FilmsResponse } from "./films";
import { AppHeader } from "./AppHeader";
import { StripeDetails } from "./StripeDetails";
import { cleanTag, QUICK_TAGS, suggestTags, TAG_RE, TAGS_MAX } from "./tags";
import "./styles.css";
import "./sample.css";
import "./dashboard.css";

/* Add a film (onboarding, and where each film is edited): add a film, fill in its details, then pay the setup fee (or use a code) to send it to review. */

const home = import.meta.env.BASE_URL;
// /add-a-film/?new=1 (from the films list) opens the "add another film" box straight away.
const startAdding = new URLSearchParams(location.search).has("new");

// Form fields kept as strings while editing; prices are typed in dollars.
const TEXT_FIELDS = [
  "title", "logline", "synopsis", "year", "runtime_minutes", "languages", "genre", "trailer_url", "vimeo_url",
  "rental_days", "rental_hours", "tier", "address_type", "subdomain", "own_domain", "contact_name", "contact_phone", "notes",
  "color_background", "color_primary", "color_secondary", "color_button",
  "pwyw_access", "tip_venmo", "tip_paypal", "tip_zelle",
] as const;
type FormState = Record<(typeof TEXT_FIELDS)[number] | "rent_price" | "buy_price" | "pwyw_enabled" | "pwyw_min" | "pwyw_suggested" | "discoverable", string>;

function toForm(f: Film): FormState {
  const out = {} as FormState;
  for (const k of TEXT_FIELDS) out[k] = f[k] == null ? "" : String(f[k]);
  out.rent_price = f.rent_price_cents == null ? "" : (f.rent_price_cents / 100).toFixed(2);
  out.buy_price = f.buy_price_cents == null ? "" : (f.buy_price_cents / 100).toFixed(2);
  out.pwyw_enabled = f.pwyw_enabled ? "1" : "";
  out.pwyw_min = (f.pwyw_min_cents / 100).toFixed(2);
  out.pwyw_suggested = f.pwyw_suggested_cents == null ? "" : (f.pwyw_suggested_cents / 100).toFixed(2);
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
  body.rent_price_cents = cents(s.rent_price);
  body.buy_price_cents = cents(s.buy_price);
  body.pwyw_enabled = s.pwyw_enabled ? 1 : 0;
  body.pwyw_min_cents = cents(s.pwyw_min);
  body.pwyw_suggested_cents = cents(s.pwyw_suggested);
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

  return (
    <div className="dash">
      <AppHeader user={user} />

      <main className="wrap dash-main">
        {loadError && <p className="dash-alert" role="alert">{loadError}</p>}
        {!data && !loadError && <p role="status">Loading…</p>}
        {data && (
          <>
            {data.films.length > 0 && (
              <FilmTabs films={data.films} selected={selected} startAdding={startAdding} onPick={pick} onAdded={(f) => { setData({ ...data, films: [f, ...data.films] }); pick(f.id); }} />
            )}
            {notice && <p className="dash-notice" role="status">{notice}</p>}
            {data.films.length === 0 ? (
              <NewFilm onCreated={(f) => { setData({ ...data, films: [f] }); pick(f.id); }} />
            ) : (
              film && <FilmView key={film.id} film={film} meta={data} onChange={replaceFilm} stripe={user?.stripe ?? null} onStripe={(st) => setUser((u) => (u ? { ...u, stripe: st } : u))} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function FilmTabs({ films, selected, startAdding, onPick, onAdded }: { films: Film[]; selected: number | null; startAdding: boolean; onPick: (id: number) => void; onAdded: (f: Film) => void }) {
  const [adding, setAdding] = useState(startAdding);
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

function NewFilm({ onCreated, compact, onCancel }: { onCreated: (f: Film) => void; compact?: boolean; onCancel?: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = String(new FormData(e.currentTarget).get("title")).trim();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ film: Film }>("/films", { body: { title } });
      onCreated(r.film);
    } catch (err) {
      setError((err as Error).message);
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
        {error && <p className="field-err" role="alert">{error}</p>}
      </form>
    </section>
  );
}

function FilmView({ film, meta, onChange, stripe, onStripe }: { film: Film; meta: FilmsResponse; onChange: (f: Film) => void; stripe: StripeInfo | null; onStripe: (s: StripeInfo) => void }) {
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
  const locked = !film.editable;

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
    if (dirty && !locked && !(await save())) return;
    location.assign(`${home}preview/?film=${film.id}`);
  }

  const field = (k: keyof FormState, label: string, opts: { type?: string; hint?: ReactNode; placeholder?: string; multiline?: number; prefix?: string; suffix?: string; inputMode?: "decimal" | "numeric" } = {}) => (
    <Field
      label={label}
      hint={opts.hint}
      error={errors[k]}
      value={form[k]}
      onChange={set(k)}
      disabled={locked}
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
            <a className="btn btn-small btn-red" href={`https://${liveAddress(film)}`} target="_blank" rel="noopener">
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

      <Steps film={film} stripe={stripe} />

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
          {locked && (
            <p className="dash-notice">
              Your film is {STATUS_LABEL[film.status].toLowerCase()}, so its details are locked. Need a change? Reply to any of our
              emails.
            </p>
          )}

          <fieldset>
            <legend>The film</legend>
            {field("title", "Title")}
            {field("logline", "One-line description", { hint: "Shown under the title on your watch page and in link previews." })}
            {field("synopsis", "Synopsis", { multiline: 6 })}
            <div className="row-3">
              {field("year", "Year", { inputMode: "numeric", placeholder: "2026" })}
              {field("runtime_minutes", "Runtime", { inputMode: "numeric", suffix: "min" })}
              {field("languages", "Languages", { placeholder: "English, Spanish" })}
            </div>
            {field("genre", "Genre", { placeholder: "Documentary" })}
          </fieldset>

          <fieldset>
            <legend>Browse</legend>
            <div className="pwyw browse">
              <label className="pwyw-toggle">
                <input
                  type="checkbox"
                  checked={!!form.discoverable}
                  disabled={locked}
                  onChange={(e) => set("discoverable")(e.target.checked ? "1" : "")}
                />
                <span>
                  <strong>Allow my film to be discovered in Browse</strong>
                  <span className="hint">Lists your film where viewers browse {site.name} films. Tags help the right viewers find it.</span>
                </span>
              </label>
              {form.discoverable && (
                <TagPicker
                  tags={tags}
                  disabled={locked}
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
              disabled={locked}
              error={errors.credits}
              onChange={(c) => {
                setCredits(c);
                setSaveState("idle");
              }}
            />
          </fieldset>

          <fieldset>
            <legend>Images</legend>
            <p className="fieldset-hint">
              The poster and wide image are required. The poster shows on desktop; the wide image shows on phones and when your
              link is shared. The banner is optional and runs across the top of your page.
            </p>
            <ImageUpload kind="poster" film={film} onChange={onChange} disabled={locked} />
            <ImageUpload kind="still" film={film} onChange={onChange} disabled={locked} />
            <ImageUpload kind="banner" film={film} onChange={onChange} disabled={locked} />
          </fieldset>

          <fieldset>
            <legend>Video</legend>
            {field("vimeo_url", "Vimeo link to the full film", {
              placeholder: "https://vimeo.com/123456789",
              hint: (
                <>
                  In Vimeo, set the film's privacy to <strong>Hide from Vimeo</strong> and embedding to <strong>Specific domains</strong>.
                  We'll add your watch page's address there during setup, so the film only plays on your page.
                </>
              ),
            })}
            {field("trailer_url", "Trailer link (YouTube or Vimeo)", { placeholder: "https://youtube.com/watch?v=…" })}
          </fieldset>

          <fieldset>
            <legend>Prices</legend>
            <p className="fieldset-hint">Set a rent price, a buy price, or both. You can also let viewers pay what they want.</p>
            <div className="row-2">
              {field("rent_price", "Rent price", { prefix: "$", inputMode: "decimal", placeholder: "4.99" })}
              {field("buy_price", "Buy price", { prefix: "$", inputMode: "decimal", placeholder: "14.99" })}
            </div>
            <div className="row-2">
              {field("rental_days", "Rental: days to start watching", { inputMode: "numeric", placeholder: "30" })}
              {field("rental_hours", "Rental: hours to finish once started", { inputMode: "numeric", placeholder: "72" })}
            </div>

            <div className="pwyw">
              <label className="pwyw-toggle">
                <input
                  type="checkbox"
                  checked={!!form.pwyw_enabled}
                  disabled={locked}
                  onChange={(e) => set("pwyw_enabled")(e.target.checked ? "1" : "")}
                />
                <span>
                  <strong>Also offer pay what you want</strong>
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
                    disabled={locked}
                    options={[
                      ["rent", `A rental (${form.rental_days || "30"} days to start, ${form.rental_hours || "72"} hours to finish)`],
                      ["buy", "Theirs to keep, like a purchase"],
                    ]}
                  />
                </>
              )}
            </div>
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
                disabled={locked}
                onChange={(v) => {
                  setBonus((b) => ({ ...b, [kind]: v }));
                  setSaveState("idle");
                }}
              />
            ))}
          </fieldset>

          <fieldset>
            <legend>Site design</legend>
            <p className="fieldset-hint">Pick your watch page's colors. We'll match the rest of the design to your poster during setup.</p>
            <div className="design">
              <div className="colors">
                {COLORS.map(([k, label, hint]) => (
                  <ColorField key={k} label={label} hint={hint} value={form[k]} fallback={COLOR_DEFAULTS[k]} onChange={set(k)} disabled={locked} error={errors[k]} />
                ))}
              </div>
              <DesignPreview form={form} />
            </div>
          </fieldset>

          <fieldset>
            <legend>Web address</legend>
            <Choice
              name="address_type"
              value={form.address_type}
              onChange={set("address_type")}
              disabled={locked}
              options={[
                ["sub", `A free address on ${site.name}`],
                ["own", "My own domain"],
              ]}
            />
            <AddressFields
              filmId={film.id}
              title={form.title}
              sub={form.subdomain}
              own={form.own_domain}
              ownMode={form.address_type === "own"}
              onSub={set("subdomain")}
              onOwn={set("own_domain")}
              disabled={locked}
              errors={errors}
            />
          </fieldset>

          <fieldset>
            <legend>Plan</legend>
            <Choice
              name="tier"
              value={form.tier}
              onChange={set("tier")}
              disabled={locked}
              options={[
                ["standard", "Standard: 8% per sale, plays from your Vimeo"],
                ["secure", "Secure: 10% per sale, protected streaming we host"],
              ]}
            />
          </fieldset>

          <fieldset>
            <legend>Contact</legend>
            <div className="row-2">
              {field("contact_name", "Your name")}
              {field("contact_phone", "Phone (optional)", { type: "tel" })}
            </div>
            {field("notes", "Anything we should know?", { multiline: 3 })}
          </fieldset>

          {!locked && (
            <div className="save-bar">
              <button className="btn" disabled={saveState === "saving" || !dirty}>
                {saveState === "saving" ? "Saving…" : "Save changes"}
              </button>
              <span className="save-state" role="status">
                {saveState === "saved" && !dirty && "Saved"}
                {dirty && saveState !== "saving" && "Unsaved changes"}
              </span>
              {saveState === "error" && <span className="field-err" role="alert">{saveError}</span>}
            </div>
          )}
        </form>

        <SetupCard film={film} meta={meta} dirty={dirty} save={save} onChange={onChange} stripe={stripe} onStripe={onStripe} />
      </div>
    </div>
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
function AddressFields({ filmId, title, sub, own, ownMode, onSub, onOwn, disabled, errors }: {
  filmId: number; title: string; sub: string; own: string; ownMode: boolean;
  onSub: (v: string) => void; onOwn: (v: string) => void; disabled: boolean; errors: Record<string, string>;
}) {
  const subId = useId();
  const ownId = useId();
  const subCheck = useAddressCheck("subdomain", sub, filmId, disabled);
  const ownCheck = useAddressCheck("domain", own, filmId, disabled || !ownMode || !own.trim());
  const full = `${sub.trim().toLowerCase() || "yourfilm"}.${site.name}`;
  const ownHost = own.trim() ? `watch.${own.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")}` : "watch.yourfilm.com";

  let status: ReactNode = null;
  if (errors.subdomain) status = <p className="field-err">Address {errors.subdomain}.</p>;
  else if (subCheck?.available) status = <p className="addr-ok">✓ {subCheck.name}.{site.name} is yours if you save it.</p>;
  else if (subCheck && (subCheck.reason || subCheck.suggestion))
    status = (
      <p className={subCheck.reason ? "field-err" : "hint"}>
        {subCheck.reason || "Pick an address for your film."}{" "}
        {subCheck.suggestion && !disabled && (
          <button type="button" className="link-btn" onClick={() => onSub(subCheck.suggestion!)}>
            Use {subCheck.suggestion}.{site.name}
          </button>
        )}
      </p>
    );

  return (
    <>
      <div className={`field${errors.subdomain || (subCheck && !subCheck.available && subCheck.reason) ? " has-err" : ""}`}>
        <label htmlFor={subId}>{ownMode ? `Your film's address on ${site.name}` : "Address"}</label>
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
          <span>.{site.name}</span>
        </div>
        <div aria-live="polite">{status}</div>
        <p className="hint">
          Each film needs its own. Letters, numbers and dashes.
          {ownMode && " Your domain points here, so it's needed even with your own domain."}
        </p>
      </div>

      {ownMode && (
        <div className={`field${errors.own_domain || (ownCheck && !ownCheck.available && ownCheck.reason) ? " has-err" : ""}`}>
          <label htmlFor={ownId}>Your domain</label>
          <input id={ownId} value={own} placeholder="yourfilm.com" disabled={disabled} spellCheck={false} autoCapitalize="none" onChange={(e) => onOwn(e.target.value)} />
          <div aria-live="polite">
            {errors.own_domain ? (
              <p className="field-err">Your domain {errors.own_domain}.</p>
            ) : ownCheck && !ownCheck.available && ownCheck.reason ? (
              <p className="field-err">{ownCheck.reason}</p>
            ) : null}
          </div>
          <p className="hint">
            Your page will be at <strong>{ownHost}</strong>. At your domain's DNS settings, add a CNAME record for{" "}
            <strong>watch</strong> pointing to <strong>{full}</strong>. We'll check it during setup.
          </p>
        </div>
      )}
    </>
  );
}

// Up to TAGS_MAX tags: tick common ones from the checklist, or type to search the full list (or add your own).
function TagPicker({ tags, onChange, disabled, error }: { tags: string[]; onChange: (t: string[]) => void; disabled: boolean; error?: string }) {
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

function BonusEditor({ kind, value, onChange, disabled }: { kind: "rent" | "buy"; value: BonusSet; onChange: (v: BonusSet) => void; disabled: boolean }) {
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

function CreditsEditor({ credits, onChange, disabled, error }: { credits: Credit[]; onChange: (c: Credit[]) => void; disabled: boolean; error?: string }) {
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

function ColorField({ label, hint, value, fallback, onChange, disabled, error }: {
  label: string; hint: string; value: string; fallback: string; onChange: (v: string) => void; disabled: boolean; error?: string;
}) {
  const id = useId();
  const shown = value || fallback;
  return (
    <div className={`color-field${error ? " has-err" : ""}`}>
      <input type="color" id={id} value={shown} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-h`} />
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
  const rent = form.rent_price.trim() || (form.buy_price.trim() ? "" : "4.99");
  const days = form.rental_days.trim() || "30";
  const hours = form.rental_hours.trim() || "72";
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
              <p>{hours} hours to finish once started</p>
            </div>
            <span className="s-btn">▶ Rent Now</span>
          </>
        ) : (
          <>
            <h3>Buy for ${form.buy_price.trim()}</h3>
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
function Steps({ film, stripe }: { film: Film; stripe: StripeInfo | null }) {
  const detailsDone = film.missing.length === 0;
  const feeDone = film.setup_status !== "unpaid";
  const reviewDone = film.status === "approved" || film.status === "live";
  const live = film.status === "live";
  const stripeNote = !reviewDone || live ? "" : stripe?.hasAccount ? "Ready: go live whenever you want" : "Add your Stripe details, then go live";
  const steps: { label: string; done: boolean; note?: string; target: string }[] = [
    { label: "Film details", done: detailsDone, note: detailsDone ? "" : `${film.missing.length} left`, target: "film-form" },
    { label: "Setup fee", done: feeDone, target: "setup-card" },
    { label: "Review", done: reviewDone, note: film.status === "changes_requested" ? "Changes requested" : "", target: "setup-card" },
    { label: "Connect Stripe and go live", done: live, note: stripeNote, target: film.status === "approved" ? (stripe?.hasAccount ? "go-live" : "get-paid") : feeDone && !live ? "get-paid" : "setup-card" },
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

function SetupCard({ film, meta, dirty, save, onChange, stripe, onStripe }: { film: Film; meta: FilmsResponse; dirty: boolean; save: () => Promise<boolean>; onChange: (f: Film) => void; stripe: StripeInfo | null; onStripe: (s: StripeInfo) => void }) {
  const [busy, setBusy] = useState<"" | "pay" | "code" | "resubmit" | "live" | "visibility">("");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const codeId = useId();
  const fee = dollars(meta.setupFeeCents).replace(".00", "");

  async function run(kind: "pay" | "code" | "resubmit" | "live" | "visibility", fn: () => Promise<void>) {
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
        stripe?.hasAccount
          ? "Your film passed review. Your page goes public when you say so: check the preview, then go live."
          : "Your film passed review. Add your Stripe details below, then you can go live whenever you're ready.",
      ],
      live: film.hidden
        ? ["Hidden", "Visitors to your address see a holding page. Nobody can rent, buy or watch until you show it again."]
        : ["Live", "Your watch page is live. Share it!"],
    };
    const [h, p] = msgs[film.status] || msgs.in_review;
    body = (
      <>
        <p className="setup-paid">✓ Setup fee {film.setup_status === "waived" ? "waived" : "paid"}</p>
        <h2>{h}</h2>
        <p>{p}</p>
        {film.admin_note && <blockquote className="admin-note">{film.admin_note}</blockquote>}
        {film.status === "approved" && (
          <div id="go-live" tabIndex={-1} className="go-live">
            <button type="button" className="btn setup-pay" onClick={goLive} disabled={!!busy || !stripe?.hasAccount}>
              {busy === "live" ? "Going live…" : "Go live"}
            </button>
            <p className="small-print">
              {stripe?.hasAccount ? "Your page becomes public and viewers can rent or buy." : "Add your Stripe details below first."}
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
  } else {
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
            <ul>
              {film.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
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
  const askStripe = film.setup_status !== "unpaid" && (film.status === "in_review" || film.status === "approved" || film.status === "changes_requested");

  return (
    <aside className="setup-card" id="setup-card" tabIndex={-1} aria-label="Setup">
      {body}
      {error && <p className="field-err" role="alert">{error}</p>}
      {askStripe && (
        <section className="setup-stripe" id="get-paid" tabIndex={-1} aria-label="Get paid">
          <h2>Get paid</h2>
          <p>
            Every sale goes straight to your own Stripe account.{" "}
            {film.status === "approved" ? "Add it here before you go live." : "Tell us which one while we review your film, so you can go live as soon as it's approved."}
          </p>
          <StripeDetails compact onSaved={onStripe} />
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

function ImageUpload({ kind, film, onChange, disabled }: { kind: keyof typeof IMAGE_KINDS; film: Film; onChange: (f: Film) => void; disabled: boolean }) {
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
    <div className="poster-up">
      <div className={`poster-frame ${kind}`}>{src ? <img src={src} alt={`${film.title} ${k.label}`} /> : <span>{k.empty}</span>}</div>
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

function Field({ label, hint, error, value, onChange, disabled, type = "text", placeholder, multiline, prefix, suffix, inputMode }: {
  label: string; hint?: ReactNode; error?: string; value: string; onChange: (v: string) => void; disabled?: boolean;
  type?: string; placeholder?: string; multiline?: number; prefix?: string; suffix?: string; inputMode?: "decimal" | "numeric";
}) {
  const id = useId();
  const common = { id, value, disabled, placeholder, "aria-invalid": !!error, "aria-describedby": hint || error ? `${id}-d` : undefined };
  return (
    <div className={`field${error ? " has-err" : ""}`}>
      <label htmlFor={id}>{label}</label>
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

function Choice({ name, value, onChange, options, disabled }: { name: string; value: string; onChange: (v: string) => void; options: [string, string][]; disabled?: boolean }) {
  return (
    <div className="choice" role="radiogroup">
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
