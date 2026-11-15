import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { site } from "./config";
import { api } from "./api";

/* Sign-up and sign-in share one screen. Both email a one-time link; /signin/?token=… finishes signing in. */

const home = import.meta.env.BASE_URL;
const dashboard = `${home}dashboard/`;

export function AuthPage({ mode }: { mode: "signup" | "signin" }) {
  const token = mode === "signin" ? new URLSearchParams(location.search).get("token") : null;
  return (
    <div className="signup">
      <header className="signup-head">
        <div className="wrap">
          <a href={home} className="wordmark">
            {site.name}
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
            ) : (
              <>
                <h1>Welcome back.</h1>
                <p className="lede">We'll email you a link to sign in. No password needed.</p>
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
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return; // links work once; don't post twice
    sent.current = true;
    api("/auth/verify", { body: { token } })
      .then(() => location.replace(dashboard))
      .catch((e) => setError(e.message));
  }, [token]);

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

function EmailForm({ mode }: { mode: "signup" | "signin" }) {
  const [sentTo, setSentTo] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState("");
  const emailId = useId();
  const termsId = useId();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("_gotcha")) return; // honeypot
    const email = String(form.get("email")).trim();
    setStatus("sending");
    setError("");
    try {
      if (site.accountsOpen || mode === "signin") {
        await api("/auth/request", { body: { email, mode, terms: form.get("terms") === "on" } });
      } else {
        // Before launch: email us the sign-up instead of creating an account.
        const body = new FormData();
        body.set("email", email);
        body.set("_subject", `New ${site.name} sign-up`);
        const res = await fetch(site.formEndpoint, { method: "POST", headers: { Accept: "application/json" }, body });
        if (!res.ok) throw new Error("That didn't go through. Check your connection and try again.");
      }
      setSentTo(email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus("idle");
    }
  }

  if (sentTo && !site.accountsOpen && mode === "signup") {
    return (
      <div role="status">
        <h2>Thanks!</h2>
        <p>
          We've received your email (<strong>{sentTo}</strong>) and will be in touch soon.
        </p>
        <a className="btn" href={home}>
          Back to {site.name}
        </a>
      </div>
    );
  }

  if (sentTo) {
    return (
      <div role="status">
        <h2>Check your email.</h2>
        <p>
          We sent a sign-in link to <strong>{sentTo}</strong>. It works once and expires in 30 minutes.
        </p>
        <button type="button" className="link-btn" onClick={() => setSentTo("")}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor={emailId}>Email</label>
      <input id={emailId} name="email" type="email" required autoComplete="email" />

      {mode === "signup" && (
        <div className="terms">
          <input id={termsId} name="terms" type="checkbox" required />
          <label htmlFor={termsId}>I agree to the Terms of Service and Privacy Policy</label>
        </div>
      )}

      {/* Honeypot: hidden from people, bots tend to fill it in */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />

      <button type="submit" className="btn" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : mode === "signup" ? "Create my account" : "Email me a sign-in link"}
      </button>
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
                <strong>Pay the setup fee.</strong> $249 once, or enter a code if we gave you one.
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
          {site.accountsOpen && (
            <p className="switch">
              Already have an account? <a href={`${home}signin/`}>Sign in</a>
            </p>
          )}
        </>
      ) : (
        <p className="switch">
          New here? <a href={`${home}signup/`}>Create an account</a>
        </p>
      )}
    </form>
  );
}
