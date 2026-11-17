import { useEffect, useId, useState, type FormEvent } from "react";
import { api, ApiError, getMe, type StripeInfo } from "./api";

/* Where the filmmaker wants to be paid. Collected while their film is in review; we connect the account by hand
   until Stripe Connect is set up. Saved on the account, so it covers all of their films. */

const COUNTRIES = [
  "United States", "Canada", "United Kingdom", "Ireland", "Australia", "New Zealand", "Germany", "France", "Italy",
  "Spain", "Portugal", "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Denmark", "Finland",
  "Poland", "Czech Republic", "Greece", "Japan", "Singapore", "Hong Kong", "Mexico", "Brazil", "Other",
];

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function StripeDetails({ compact }: { compact?: boolean }) {
  const [saved, setSaved] = useState<StripeInfo | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    getMe().then((u) => setSaved(u?.stripe ?? null)).catch(() => setSaved(null));
  }, []);

  if (saved === undefined) return null;

  if (saved && !editing) {
    return (
      <div className="stripe-saved">
        {saved.hasAccount ? (
          <>
            <p className="setup-paid">✓ Stripe details saved</p>
            <dl className="stripe-dl">
              <div><dt>Stripe email</dt><dd>{saved.email}</dd></div>
              {saved.accountId && <div><dt>Account ID</dt><dd>{saved.accountId}</dd></div>}
              <div><dt>Bank country</dt><dd>{saved.country}</dd></div>
            </dl>
            <p className="small-print">
              Saved {day(saved.updatedAt)}. We'll send you a link to connect this account before your page goes live.
            </p>
          </>
        ) : (
          <>
            <p>
              You told us you don't have a Stripe account yet. <a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener">Create one for free</a>,
              then add it here.
            </p>
          </>
        )}
        <button type="button" className="link-btn" onClick={() => setEditing(true)}>
          {saved.hasAccount ? "Change these details" : "I have one now"}
        </button>
      </div>
    );
  }

  return (
    <StripeForm
      saved={saved}
      compact={compact}
      onSaved={(s) => {
        setSaved(s);
        setEditing(false);
      }}
      onCancel={saved ? () => setEditing(false) : undefined}
    />
  );
}

function StripeForm({ saved, compact, onSaved, onCancel }: { saved: StripeInfo | null; compact?: boolean; onSaved: (s: StripeInfo) => void; onCancel?: () => void }) {
  const [has, setHas] = useState<boolean | null>(saved ? true : null);
  const [email, setEmail] = useState(saved?.email || "");
  const [accountId, setAccountId] = useState(saved?.accountId || "");
  const [country, setCountry] = useState(saved?.country || "United States");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = { yes: useId(), no: useId(), email: useId(), acct: useId(), country: useId() };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (has == null) return setError("Choose whether you have a Stripe account.");
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const r = await api<{ stripe: StripeInfo }>("/auth/stripe", { method: "PUT", body: { hasAccount: has, email, accountId, country } });
      onSaved(r.stripe);
    } catch (err) {
      setErrors((err as ApiError).errors || {});
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`stripe-form${compact ? " compact" : ""}`} onSubmit={onSubmit}>
      <fieldset className="stripe-choice">
        <legend>Do you have a Stripe account?</legend>
        <label htmlFor={ids.yes}>
          <input id={ids.yes} type="radio" name="has" checked={has === true} onChange={() => setHas(true)} /> Yes
        </label>
        <label htmlFor={ids.no}>
          <input id={ids.no} type="radio" name="has" checked={has === false} onChange={() => setHas(false)} /> Not yet
        </label>
      </fieldset>

      {has === false && (
        <p className="small-print stripe-help">
          It's free and takes about 10 minutes: <a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener">create a Stripe account</a>.
          You can save this now and add the account when it's ready.
        </p>
      )}

      {has === true && (
        <>
          <div className={`field${errors.email ? " has-err" : ""}`}>
            <label htmlFor={ids.email}>Email you sign in to Stripe with</label>
            <input id={ids.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className={`field${errors.accountId ? " has-err" : ""}`}>
            <label htmlFor={ids.acct}>Account ID (optional)</label>
            <input id={ids.acct} value={accountId} onChange={(e) => setAccountId(e.target.value.trim())} placeholder="acct_…" spellCheck={false} autoComplete="off" />
            <p className="small-print">In Stripe: Settings, then Business, then Account details.</p>
          </div>
        </>
      )}

      {has != null && (
        <div className={`field${errors.country ? " has-err" : ""}`}>
          <label htmlFor={ids.country}>Country your bank account is in</label>
          <select id={ids.country} value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      <div className="stripe-actions">
        <button className="btn btn-small" disabled={busy || has == null}>
          {busy ? "Saving…" : "Save Stripe details"}
        </button>
        {onCancel && (
          <button type="button" className="link-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="field-err" role="alert">{error}</p>}
    </form>
  );
}
