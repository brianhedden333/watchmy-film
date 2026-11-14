import { StrictMode, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { site } from "./config";
import { WatchPreview, slugify } from "./WatchPreview";
import "./styles.css";
import "./account.css";

/* Mockup of the filmmaker's account settings. No backend: text fields save to this browser only. */

type Settings = {
  title: string;
  logline: string;
  synopsis: string;
  runtime: string;
  year: string;
  credits: string;
  vimeo: string;
  trailer: string;
  captions: string;
  offerRent: boolean;
  rentPrice: string;
  rentalHours: string;
  offerBuy: boolean;
  buyPrice: string;
  addressType: "sub" | "own";
  subdomain: string;
  ownDomain: string;
  supportEmail: string;
  website: string;
};

const blank: Settings = {
  title: "Saltwater Hymns",
  logline: "",
  synopsis: "",
  runtime: "",
  year: "",
  credits: "",
  vimeo: "",
  trailer: "",
  captions: "",
  offerRent: true,
  rentPrice: "5.99",
  rentalHours: "48",
  offerBuy: true,
  buyPrice: "12.99",
  addressType: "sub",
  subdomain: "saltwaterhymns",
  ownDomain: "",
  supportEmail: "",
  website: "",
};

const STORE = "watchfilm-account-mock";

function load(): Settings {
  try {
    return { ...blank, ...JSON.parse(localStorage.getItem(STORE) || "{}") };
  } catch {
    return blank;
  }
}

/* ---------- Link parsing ---------- */

function parseVimeo(url: string): { id: string; hash?: string } | null {
  const m =
    url.match(/player\.vimeo\.com\/video\/(\d+)(?:\?.*?\bh=([a-f0-9]+))?/i) ||
    url.match(/vimeo\.com\/(?:.*\/)?(\d{6,})(?:\/([a-f0-9]{6,}))?/i);
  return m ? { id: m[1], hash: m[2] } : null;
}

function parseTrailer(url: string): { kind: "YouTube" | "Vimeo"; embed: string } | null {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/i);
  if (yt) return { kind: "YouTube", embed: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const v = parseVimeo(url);
  if (v) return { kind: "Vimeo", embed: `https://player.vimeo.com/video/${v.id}${v.hash ? `?h=${v.hash}` : ""}` };
  return null;
}

const priceOk = (p: string) => /^\d{1,4}(\.\d{2})?$/.test(p) && parseFloat(p) >= 3.99;
const subOk = (s: string) => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(s);
const domainOk = (d: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d);

/* ---------- Small field helpers ---------- */

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string, describedBy?: string) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children(id, hint || error ? hintId : undefined)}
      {(error || hint) && (
        <p id={hintId} className={error ? "field-error" : "field-hint"}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

function ImageUpload({
  label,
  hint,
  url,
  onChange,
  ratio,
}: {
  label: string;
  hint: string;
  url?: string;
  onChange: (url?: string) => void;
  ratio: "poster" | "wide";
}) {
  const id = useId();
  return (
    <div className="field">
      <span className="label-text">{label}</span>
      <div className={`upload upload-${ratio}`}>
        {url ? <img src={url} alt="" /> : <span className="upload-empty">No image yet</span>}
      </div>
      <div className="upload-actions">
        <input
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="visually-hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange(URL.createObjectURL(f));
          }}
        />
        <label htmlFor={id} className="btn-quiet">
          {url ? "Replace image" : "Upload image"}
        </label>
        {url && (
          <button type="button" className="btn-link" onClick={() => onChange(undefined)}>
            Remove
          </button>
        )}
      </div>
      <p className="field-hint">{hint}</p>
    </div>
  );
}

/* ---------- Page ---------- */

function Account() {
  const [s, setS] = useState<Settings>(load);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(load()));
  const [poster, setPoster] = useState<string>();
  const [wideArt, setWideArt] = useState<string>();
  const [toast, setToast] = useState<string | null>(null);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(s) !== savedJson;

  const vimeo = parseVimeo(s.vimeo);
  const trailer = parseTrailer(s.trailer);
  const address = s.addressType === "sub" ? `${s.subdomain || "yourfilm"}.watchmy.film` : s.ownDomain ? `watch.${s.ownDomain}` : "watch.yourfilm.com";

  const errors = useMemo(
    () => ({
      title: s.title.trim() ? null : "Add the film's title. It appears on the page and in receipts.",
      vimeo: s.vimeo && !vimeo ? "That doesn't look like a Vimeo video link. Copy it from the video's Share menu." : null,
      trailer: s.trailer && !trailer ? "Use a YouTube or Vimeo link to the trailer." : null,
      rentPrice: s.offerRent && !priceOk(s.rentPrice) ? "Use a price of at least 3.99, like 5.99." : null,
      buyPrice: s.offerBuy && !priceOk(s.buyPrice) ? "Use a price of at least 3.99, like 12.99." : null,
      offers: !s.offerRent && !s.offerBuy ? "Turn on renting, buying, or both, so viewers can pay." : null,
      subdomain: s.addressType === "sub" && !subOk(s.subdomain) ? "Use lowercase letters, numbers and hyphens." : null,
      ownDomain: s.addressType === "own" && s.ownDomain && !domainOk(s.ownDomain) ? "Enter just the domain, like yourfilm.com." : null,
    }),
    [s, vimeo, trailer]
  );
  const errorCount = Object.values(errors).filter(Boolean).length;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function saveChanges() {
    if (errorCount) {
      setToast(`Fix ${errorCount} ${errorCount === 1 ? "field" : "fields"} before saving.`);
      return;
    }
    const json = JSON.stringify(s);
    try {
      localStorage.setItem(STORE, json);
    } catch {
      /* storage unavailable */
    }
    setSavedJson(json);
    setToast("Changes saved in this browser.");
  }

  return (
    <div className="acct">
      <div className="mock-banner" role="note">
        Mockup. Nothing here is sent anywhere; text fields save only in this browser, and images
        are forgotten when you reload.
      </div>

      <header className="acct-head">
        <div className="acct-wrap acct-head-inner">
          <a href={import.meta.env.BASE_URL} className="wordmark">
            {site.name}
          </a>
          <span className="acct-user">Signed in as filmmaker@example.com</span>
        </div>
      </header>

      <div className="acct-wrap acct-title">
        <h1>{s.title.trim() || "Your film"}</h1>
        <p>Film settings. Changes appear on your watch page after you save.</p>
      </div>

      <div className="acct-wrap acct-grid">
        <form
          className="acct-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveChanges();
          }}
          noValidate
        >
          <section aria-labelledby="sec-film">
            <h2 id="sec-film">Film details</h2>
            <Field label="Title" error={errors.title}>
              {(id, d) => <input id={id} aria-describedby={d} value={s.title} onChange={(e) => set("title", e.target.value)} />}
            </Field>
            <Field label="Logline" hint="One sentence. Shown under the title and when the link is shared.">
              {(id, d) => (
                <input id={id} aria-describedby={d} maxLength={160} value={s.logline} onChange={(e) => set("logline", e.target.value)} />
              )}
            </Field>
            <Field label="Synopsis" hint={`${s.synopsis.length} / 1200 characters`}>
              {(id, d) => (
                <textarea
                  id={id}
                  aria-describedby={d}
                  rows={6}
                  maxLength={1200}
                  value={s.synopsis}
                  onChange={(e) => set("synopsis", e.target.value)}
                />
              )}
            </Field>
            <div className="row">
              <Field label="Runtime (minutes)">
                {(id) => <input id={id} inputMode="numeric" value={s.runtime} onChange={(e) => set("runtime", e.target.value.replace(/\D/g, ""))} />}
              </Field>
              <Field label="Year">
                {(id) => <input id={id} inputMode="numeric" maxLength={4} value={s.year} onChange={(e) => set("year", e.target.value.replace(/\D/g, ""))} />}
              </Field>
            </div>
            <Field label="Credits" hint="One per line, like “Director: Jane Doe”.">
              {(id, d) => <textarea id={id} aria-describedby={d} rows={4} value={s.credits} onChange={(e) => set("credits", e.target.value)} />}
            </Field>
          </section>

          <section aria-labelledby="sec-video">
            <h2 id="sec-video">Film and trailer</h2>
            <Field
              label="Vimeo link to the film"
              error={errors.vimeo}
              hint={
                vimeo ? (
                  <span className="ok">
                    Found video {vimeo.id}
                    {vimeo.hash ? " (private link)" : ""}. In Vimeo, set Embed to “Specific domains” and add {address}.
                  </span>
                ) : (
                  "From the video's Share menu in Vimeo. Viewers only see it after they pay."
                )
              }
            >
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  type="url"
                  placeholder="https://vimeo.com/123456789"
                  value={s.vimeo}
                  onChange={(e) => set("vimeo", e.target.value.trim())}
                />
              )}
            </Field>
            <Field
              label="Trailer link"
              error={errors.trailer}
              hint={trailer ? <span className="ok">{trailer.kind} trailer found. It plays for everyone, free.</span> : "YouTube or Vimeo."}
            >
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  type="url"
                  placeholder="https://youtu.be/…"
                  value={s.trailer}
                  onChange={(e) => set("trailer", e.target.value.trim())}
                />
              )}
            </Field>
            {trailer && (
              <div className="trailer-embed">
                <iframe src={trailer.embed} title="Trailer preview" allow="fullscreen; picture-in-picture" loading="lazy" />
              </div>
            )}
            <Field label="Captions" hint="Upload captions to Vimeo directly. Note the languages here so we can list them.">
              {(id, d) => (
                <input id={id} aria-describedby={d} placeholder="English, Spanish" value={s.captions} onChange={(e) => set("captions", e.target.value)} />
              )}
            </Field>
          </section>

          <section aria-labelledby="sec-art">
            <h2 id="sec-art">Artwork</h2>
            <div className="row art-row">
              <ImageUpload label="Poster" hint="2:3, at least 1000 × 1500 px. Used when the link is shared." url={poster} onChange={setPoster} ratio="poster" />
              <ImageUpload label="Wide artwork" hint="16:9, at least 1920 × 1080 px. Fills the player before someone presses play." url={wideArt} onChange={setWideArt} ratio="wide" />
            </div>
          </section>

          <section aria-labelledby="sec-price">
            <h2 id="sec-price">Prices</h2>
            {errors.offers && <p className="field-error block">{errors.offers}</p>}
            <div className="offer-set">
              <label className="switch">
                <input type="checkbox" checked={s.offerRent} onChange={(e) => set("offerRent", e.target.checked)} />
                Offer rentals
              </label>
              {s.offerRent && (
                <div className="row">
                  <Field label="Rental price (USD)" error={errors.rentPrice}>
                    {(id, d) => (
                      <span className="money-input">
                        <input id={id} aria-describedby={d} inputMode="decimal" value={s.rentPrice} onChange={(e) => set("rentPrice", e.target.value)} />
                      </span>
                    )}
                  </Field>
                  <Field label="Rental window">
                    {(id) => (
                      <select id={id} value={s.rentalHours} onChange={(e) => set("rentalHours", e.target.value)}>
                        <option value="24">24 hours</option>
                        <option value="48">48 hours</option>
                        <option value="72">72 hours</option>
                        <option value="168">7 days</option>
                      </select>
                    )}
                  </Field>
                </div>
              )}
            </div>
            <div className="offer-set">
              <label className="switch">
                <input type="checkbox" checked={s.offerBuy} onChange={(e) => set("offerBuy", e.target.checked)} />
                Offer purchases
              </label>
              {s.offerBuy && (
                <Field label="Purchase price (USD)" error={errors.buyPrice} hint="Buyers can watch any time.">
                  {(id, d) => (
                    <span className="money-input">
                      <input id={id} aria-describedby={d} inputMode="decimal" value={s.buyPrice} onChange={(e) => set("buyPrice", e.target.value)} />
                    </span>
                  )}
                </Field>
              )}
            </div>
          </section>

          <section aria-labelledby="sec-address">
            <h2 id="sec-address">Web address</h2>
            <fieldset className="radio-set">
              <legend className="visually-hidden">Where your watch page lives</legend>
              <label>
                <input type="radio" name="addr" checked={s.addressType === "sub"} onChange={() => set("addressType", "sub")} />
                On watchmy.film
              </label>
              <label>
                <input type="radio" name="addr" checked={s.addressType === "own"} onChange={() => set("addressType", "own")} />
                On your own domain
              </label>
            </fieldset>
            {s.addressType === "sub" ? (
              <Field label="Address" error={errors.subdomain}>
                {(id, d) => (
                  <span className="suffix-input">
                    <input
                      id={id}
                      aria-describedby={d}
                      value={s.subdomain}
                      onChange={(e) => set("subdomain", e.target.value.toLowerCase())}
                    />
                    <span>.watchmy.film</span>
                  </span>
                )}
              </Field>
            ) : (
              <>
                <Field label="Your domain" error={errors.ownDomain}>
                  {(id, d) => (
                    <span className="prefix-input">
                      <span>watch.</span>
                      <input
                        id={id}
                        aria-describedby={d}
                        placeholder="yourfilm.com"
                        value={s.ownDomain}
                        onChange={(e) => set("ownDomain", e.target.value.toLowerCase().trim())}
                      />
                    </span>
                  )}
                </Field>
                <div className="dns-box">
                  <p>Add this record where your domain's DNS is managed:</p>
                  <dl>
                    <div>
                      <dt>Type</dt>
                      <dd>CNAME</dd>
                    </div>
                    <div>
                      <dt>Name</dt>
                      <dd>watch</dd>
                    </div>
                    <div>
                      <dt>Value</dt>
                      <dd>pages.watchmy.film</dd>
                    </div>
                  </dl>
                  <p className="dns-status">Status: waiting for the record. Checks run every few minutes.</p>
                </div>
              </>
            )}
            <SuggestSlug
              label={s.addressType === "sub" ? (subOk(s.subdomain) ? `Suggested from title: ${slugify(s.title)}` : "") : ""}
              onUse={() => set("subdomain", slugify(s.title))}
              show={s.addressType === "sub" && s.subdomain !== slugify(s.title) && !!s.title.trim()}
            />
          </section>

          <section aria-labelledby="sec-pay">
            <h2 id="sec-pay">Payments</h2>
            <div className="stripe-box">
              <div>
                <p className="stripe-state">Stripe not connected</p>
                <p className="field-hint">Sales go to your own Stripe account. Connecting takes about 10 minutes and needs your bank details.</p>
              </div>
              <button type="button" className="btn btn-small" disabled title="Not available in the mockup">
                Connect Stripe
              </button>
            </div>
          </section>

          <section aria-labelledby="sec-contact">
            <h2 id="sec-contact">Contact</h2>
            <div className="row">
              <Field label="Support email shown to viewers" hint="Refund questions come here. Playback problems come to us.">
                {(id, d) => (
                  <input id={id} aria-describedby={d} type="email" value={s.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} />
                )}
              </Field>
              <Field label="Film website">
                {(id) => <input id={id} type="url" placeholder="https://" value={s.website} onChange={(e) => set("website", e.target.value)} />}
              </Field>
            </div>
          </section>

          <div className="save-bar">
            <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
            <button type="submit" className="btn" disabled={!dirty}>
              Save changes
            </button>
          </div>
        </form>

        <aside className="acct-preview" aria-label="Watch page preview">
          <p className="preview-label">Preview of your watch page</p>
          <WatchPreview
            title={s.title}
            address={address}
            artUrl={wideArt ?? poster}
            offerRent={s.offerRent}
            rentPrice={s.rentPrice}
            rentalLabel={s.rentalHours === "168" ? "7 days" : `${s.rentalHours} hours`}
            offerBuy={s.offerBuy}
            buyPrice={s.buyPrice}
          />
          {s.logline && <p className="preview-logline">{s.logline}</p>}
        </aside>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function SuggestSlug({ label, onUse, show }: { label: string; onUse: () => void; show: boolean }) {
  if (!show || !label) return null;
  return (
    <button type="button" className="btn-link suggest" onClick={onUse}>
      {label}
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Account />
  </StrictMode>
);
