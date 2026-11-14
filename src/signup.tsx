import { StrictMode, useId, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { site } from "./config";
import "./styles.css";
import "./signup.css";

/* Account sign-up. No accounts yet: submitting emails the address to us through the contact form endpoint. */

function Signup() {
  const [done, setDone] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const emailId = useId();
  const termsId = useId();
  const home = import.meta.env.BASE_URL;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const body = new FormData();
    body.set("email", email);
    body.set("_subject", `New ${site.name} sign-up`);
    body.set("_gotcha", String(form.get("_gotcha") || ""));
    setStatus("sending");
    try {
      const res = await fetch(site.formEndpoint, { method: "POST", headers: { Accept: "application/json" }, body });
      if (!res.ok) throw new Error(String(res.status));
      setDone(email);
    } catch {
      setStatus("error");
    }
  }

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
          </div>

          <div className="signup-card">
            {done ? (
              <div role="status">
                <h2>Thanks for signing up.</h2>
                <p>
                  We'll email you at <strong>{done}</strong> to set up your film.
                </p>
                <a className="btn" href={home}>
                  Back to {site.name}
                </a>
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                <label htmlFor={emailId}>Email</label>
                <input id={emailId} name="email" type="email" required autoComplete="email" />

                <div className="terms">
                  <input id={termsId} name="terms" type="checkbox" required />
                  <label htmlFor={termsId}>I agree to the Terms of Service and Privacy Policy</label>
                </div>

                {/* Honeypot: hidden from people, bots tend to fill it in */}
                <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />

                <button type="submit" className="btn" disabled={status === "sending"}>
                  {status === "sending" ? "Creating your account…" : "Create my account"}
                </button>
                {status === "error" && (
                  <p className="signup-err" role="alert">
                    That didn't go through. Check your connection and try again.
                  </p>
                )}

                <details className="next-steps">
                  <summary>What happens next?</summary>
                  <ol>
                    <li>
                      <strong>Add your film.</strong> Enter its title, poster, trailer and prices.
                    </li>
                    <li>
                      <strong>Connect Stripe.</strong> Add your Stripe account so every sale is paid straight to you.
                    </li>
                    <li>
                      <strong>We review your film.</strong> We check the film and its content before anything goes
                      public.
                    </li>
                    <li>
                      <strong>Your site goes live.</strong> Your watch page is ready to start sharing.
                    </li>
                  </ol>
                </details>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Signup />
  </StrictMode>
);
