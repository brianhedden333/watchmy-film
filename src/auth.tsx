import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { pricing, site } from "./config";
import { api, getMe } from "./api";

/* Sign-up and sign-in share one screen.
   Sign-up emails a one-time link that confirms the address; /signin/?token=… finishes, then offers to set a password.
   Sign-in takes a password (if the account has one) or emails a new link. */

const home = import.meta.env.BASE_URL;
// The server says where to land (films list, or add-a-film until a film is published); paths start with "/".
// Sign-up and sign-in forms submitted sooner than this after appearing are treated as bots.
const MIN_FILL_MS = 2500;

const go = (next: string) => location.replace(`${home}${next.replace(/^\//, "")}`);

export function AuthPage({ mode }: { mode: "signup" | "signin" }) {
  const token = mode === "signin" ? new URLSearchParams(location.search).get("token") : null;
  return (
    <div className="signup">
      <header className="signup-head">
        <div className="wrap">
          <a href={home} className="logo-link" aria-label={`${site.name} home`}>
            <img src={`${home}brand/watchmyfilm-logo-white.png`} alt="" width={600} height={163} className="auth-logo" />
          </a>
        </div>
      </header>

      <main className="signup-main">
        <div className="wrap signup-grid">
          <div className="signup-copy">
            {mode === "signup" ? (
              <>
                <h1>Create an account and start selling your film within hours.</h1>
                <p className="lede">
                  Your film on its own web address, every sale paid into your Stripe account, and the viewer list is
                  yours.
                </p>
                <ul className="hero-points">
                  <li>No monthly fee</li>
                  <li>No exclusivity</li>
                  <li>Custom domain</li>
                </ul>
              </>
            ) : token ? (
              <h1>Welcome.</h1>
            ) : (
              <>
                <h1>Welcome back.</h1>
                <p className="lede">Sign in with your password, or we'll email you a link.</p>
              </>
            )}
          </div>

          <div className="signup-card">{token ? <VerifyToken token={token} /> : <EmailForm mode={mode} />}</div>
        </div>
      </main>
    </div>
  );
}

function VerifyToken({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [offer, setOffer] = useState<{ next: string; justVerified: boolean } | null>(null);
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return; // links work once; don't post twice
    sent.current = true;
    api<{ justVerified: boolean; hasPassword: boolean; next: string }>("/auth/verify", { body: { token } })
      .then((r) => (r.hasPassword ? go(r.next) : setOffer({ next: r.next, justVerified: r.justVerified })))
      .catch((e) => setError(e.message));
  }, [token]);

  if (offer) return <SetPassword {...offer} />;
  if (!error) return <p role="status">Signing you in…</p>;
  return (
    <div role="alert">
      <h2>That link didn't work.</h2>
      <p>{error}</p>
      <a className="btn" href={`${home}signin/`}>
        Send a new link
      </a>
    </div>
  );
}

// Shown after a sign-in link while the account has no password. Skipping keeps sign-in by emailed link.
function SetPassword({ next, justVerified }: { next: string; justVerified: boolean }) {
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const pwId = useId();
  const hintId = useId();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    setBusy(true);
    setError("");
    try {
      await api("/auth/password", { body: { password } });
      go(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>{justVerified ? "Your email is confirmed." : "You're signed in."}</h2>
      <p className="card-lede">
        Create a password to sign in without waiting for an email, or skip it and keep using sign-in links.
      </p>
      <label htmlFor={pwId}>New password</label>
      <div className="pw-row">
        <input
          id={pwId}
          name="password"
          type={show ? "text" : "password"}
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          aria-describedby={hintId}
        />
        <button type="button" className="link-btn pw-toggle" onClick={() => setShow((v) => !v)} aria-pressed={show}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <p className="field-hint" id={hintId}>
        At least 8 characters.
      </p>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Saving…" : "Save password and continue"}
      </button>
      {error && (
        <p className="signup-err" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="link-btn skip" onClick={() => go(next)} disabled={busy}>
        Skip for now
      </button>
    </form>
  );
}

// After a link is sent: where it went, what to do, and a way to send it again.
function CheckEmail({ email, mode, expires, onChange }: { email: string; mode: "signup" | "signin"; expires: string; onChange: () => void }) {
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function sendAgain() {
    setResend("sending");
    try {
      await api("/auth/request", { body: { email, mode, terms: true, _gotcha: "", elapsed: 60_000 } });
      setResend("sent");
    } catch (e) {
      setError((e as Error).message);
      setResend("error");
    }
  }

  return (
    <div role="status">
      <h2>Check your email.</h2>
      <p>
        We sent an email to <strong>{email}</strong>.{" "}
        {mode === "signup"
          ? "Click the link in it to confirm your email address and finish creating your account."
          : "Click the link in it to sign in."}
      </p>
      <p className="small-note">The link works once and expires in {expires}. It comes from hello@watchmyfilm.online.</p>
      <p className="small-note">
        Not there after a few minutes? Check your spam or junk folder (some inboxes, like iCloud, can take a while), or{" "}
        <button type="button" className="link-btn" onClick={sendAgain} disabled={resend === "sending" || resend === "sent"}>
          {resend === "sending" ? "sending…" : resend === "sent" ? "sent again" : "send it again"}
        </button>
        .
      </p>
      {resend === "error" && <p className="signup-err">{error}</p>}
      <button type="button" className="link-btn" onClick={onChange}>
        Use a different email
      </button>
    </div>
  );
}

function EmailForm({ mode }: { mode: "signup" | "signin" }) {
  const [sentTo, setSentTo] = useState("");
  const [expires, setExpires] = useState("30 minutes");
  const [status, setStatus] = useState<"idle" | "password" | "link">("idle");
  const [error, setError] = useState("");
  const emailId = useId();
  const termsId = useId();
  const pwId = useId();
  // Spam checks: when the form appeared (people take a few seconds; bots submit instantly) and a hidden honeypot field.
  const shownAt = useRef(Date.now());

  // Already signed in? Skip the form.
  useEffect(() => {
    if (mode === "signin") getMe().then((u) => u && go(u.home)).catch(() => {});
  }, [mode]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const gotcha = String(form.get("_gotcha") || "");
    const elapsed = Date.now() - shownAt.current;
    // Honeypot filled in: act as if it worked, so a bot learns nothing.
    if (gotcha) {
      setSentTo(email);
      return;
    }
    // Faster than a person can type: ask them to try again rather than silently dropping it.
    if (elapsed < MIN_FILL_MS) {
      setError("One moment, then try again.");
      return;
    }
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const how = mode === "signin" && submitter?.value === "password" ? "password" : "link";
    const password = String(form.get("password") || "");
    setError("");
    if (how === "password" && !password) {
      setError("Enter your password, or email yourself a sign-in link.");
      return;
    }
    setStatus(how);
    try {
      if (how === "password") {
        const r = await api<{ next: string }>("/auth/login", { body: { email, password } });
        go(r.next);
        return;
      }
      const r = await api<{ expires?: string }>("/auth/request", { body: { email, mode, terms: form.get("terms") === "on", _gotcha: gotcha, elapsed } });
      setExpires(r.expires || (mode === "signup" ? "24 hours" : "30 minutes"));
      setSentTo(email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus("idle");
    }
  }

  if (sentTo) {
    return <CheckEmail email={sentTo} mode={mode} expires={expires} onChange={() => setSentTo("")} />;
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor={emailId}>Email</label>
      <input id={emailId} name="email" type="email" required autoComplete={mode === "signin" ? "username" : "email"} />

      {mode === "signin" && (
        <div className="signin-options">
          <label htmlFor={pwId}>Password</label>
          <input id={pwId} name="password" type="password" autoComplete="current-password" maxLength={200} />
          <button type="submit" name="how" value="password" className="btn" disabled={status !== "idle"}>
            {status === "password" ? "Signing in…" : "Sign in"}
          </button>
          <p className="or" aria-hidden="true">
            or
          </p>
          <button type="submit" name="how" value="link" className="btn btn-ghost" disabled={status !== "idle"}>
            {status === "link" ? "Sending…" : "Email me a sign-in link"}
          </button>
          <p className="field-hint">No password yet, or forgot it? The link signs you in.</p>
        </div>
      )}

      {mode === "signup" && (
        <div className="terms">
          <input id={termsId} name="terms" type="checkbox" required />
          <label htmlFor={termsId}>I agree to the Terms of Service and Privacy Policy</label>
        </div>
      )}

      {/* Honeypot: hidden from people, bots tend to fill it in */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />

      {mode === "signup" && (
        <button type="submit" className="btn" disabled={status !== "idle"}>
          {status !== "idle" ? "Sending…" : "Create my account"}
        </button>
      )}
      {error && (
        <p className="signup-err" role="alert">
          {error}
        </p>
      )}

      {mode === "signup" ? (
        <>
          <details className="next-steps">
            <summary>What happens next?</summary>
            <ol>
              <li>
                <strong>Add your film.</strong> Enter its title, poster, trailer and prices.
              </li>
              <li>
                <strong>Pay the setup fee.</strong> ${pricing.setupFee} once, or enter a code if we gave you one.
              </li>
              <li>
                <strong>We review your film.</strong> We check the film and its content before anything goes public.
              </li>
              <li>
                <strong>Connect Stripe and go live.</strong> Every sale is paid straight to you, and your watch page is
                ready to share.
              </li>
            </ol>
          </details>
          <p className="switch">
            Already have an account? <a href={`${home}signin/`}>Sign in</a>
          </p>
        </>
      ) : (
        <p className="switch">
          New here? <a href={`${home}signup/`}>Create an account</a>
        </p>
      )}
    </form>
  );
}
