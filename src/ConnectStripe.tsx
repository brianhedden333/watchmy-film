import { useEffect, useState } from "react";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import {
  ConnectAccountManagement,
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
  ConnectNotificationBanner,
} from "@stripe/react-connect-js";
import { api, type ConnectInfo } from "./api";

/* Connects the filmmaker's own Stripe account (Stripe Connect). Onboarding runs inside this page with Stripe's
   embedded components; Stripe collects identity and bank details, never us. Used on add-a-film and Account.
   Sales are charged on their account, so it covers all of their films. */

type SessionResponse = { clientSecret: string; publishableKey: string; connect: ConnectInfo };

// Matches the dark screening-room palette (src/styles.css).
const appearance = {
  overlays: "dialog" as const,
  variables: {
    fontFamily: "Archivo, system-ui, sans-serif",
    colorPrimary: "#ede8df",
    colorBackground: "#1f1d1b",
    colorText: "#ede8df",
    colorSecondaryText: "#a39e95",
    colorBorder: "#3a3734",
    buttonPrimaryColorBackground: "#ede8df",
    buttonPrimaryColorText: "#000000",
    borderRadius: "8px",
  },
};

export function ConnectStripe({ initial, onChange }: { initial?: ConnectInfo | null; onChange?: (c: ConnectInfo) => void }) {
  const [info, setInfo] = useState<ConnectInfo | null | undefined>(initial);
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null);
  const [mode, setMode] = useState<"" | "onboarding" | "manage">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (c: ConnectInfo) => {
    setInfo(c);
    onChange?.(c);
  };

  // Fresh status from Stripe whenever the panel shows.
  useEffect(() => {
    api<{ connect: ConnectInfo }>("/connect")
      .then((r) => update(r.connect))
      .catch(() => setInfo((v) => (v === undefined ? null : v)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The embedded components need a Connect instance; it asks our server for a new session whenever one expires.
  async function start(next: "onboarding" | "manage") {
    setBusy(true);
    setError("");
    try {
      if (!instance) {
        const first = await api<SessionResponse>("/connect/session", { body: {} });
        update(first.connect);
        let used = false;
        const inst = loadConnectAndInitialize({
          publishableKey: first.publishableKey,
          fetchClientSecret: async () => {
            if (!used) {
              used = true;
              return first.clientSecret;
            }
            return (await api<SessionResponse>("/connect/session", { body: {} })).clientSecret;
          },
          appearance,
        });
        setInstance(inst);
      }
      setMode(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    try {
      const r = await api<{ connect: ConnectInfo }>("/connect");
      update(r.connect);
      return r.connect;
    } catch {
      return null; /* keep what we have */
    }
  }

  // Stripe verifies the details in the background for a little while after onboarding is submitted,
  // so keep re-checking for up to a minute and a half instead of showing "isn't finished".
  const [checking, setChecking] = useState(false);
  async function afterOnboarding() {
    setMode("");
    setChecking(true);
    for (let i = 0; i < 18; i++) {
      const c = await refresh();
      if (c?.canAcceptPayments) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    setChecking(false);
  }

  if (info === undefined) return <p className="small-print">Checking your Stripe account…</p>;

  const active = !!info?.canAcceptPayments;
  const started = !!info?.accountId;

  return (
    <div className="connect-stripe">
      {!active && <SecureNote />}
      {active ? (
        <p className="setup-paid">✓ Stripe connected. Sales are charged on your own Stripe account.</p>
      ) : checking ? (
        <p role="status">Stripe is checking your details. This usually takes less than a minute…</p>
      ) : started ? (
        <p>
          {info?.cardPayments === "pending"
            ? "Stripe is checking your details. This usually takes a few minutes."
            : "Your Stripe account isn't finished yet. Pick up where you left off."}
        </p>
      ) : (
        <p>
          Sales are charged on your own Stripe account and paid out to your bank. Setting it up takes about 10 minutes
          inside this page: Stripe asks for your details and bank account, not us. Already have Stripe? Sign in to it
          during setup.
        </p>
      )}

      {instance && (
        <ConnectComponentsProvider connectInstance={instance}>
          {active && <ConnectNotificationBanner />}
          {mode === "onboarding" && (
            <div className="connect-embed">
              <ConnectAccountOnboarding onExit={afterOnboarding} />
            </div>
          )}
          {mode === "manage" && (
            <div className="connect-embed">
              <ConnectAccountManagement />
            </div>
          )}
        </ConnectComponentsProvider>
      )}

      <div className="stripe-actions">
        {!active && !checking && mode !== "onboarding" && (
          <button type="button" className="btn btn-small" onClick={() => start("onboarding")} disabled={busy}>
            {busy ? "Opening Stripe…" : started ? "Continue Stripe setup" : "Connect Stripe"}
          </button>
        )}
        {active && mode !== "manage" && (
          <>
            <button type="button" className="link-btn" onClick={() => start("manage")} disabled={busy}>
              {busy ? "Opening…" : "Account and bank details"}
            </button>
            <a className="link-btn" href="https://dashboard.stripe.com/" target="_blank" rel="noopener">
              Open your Stripe Dashboard
            </a>
          </>
        )}
        {mode && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode("");
              refresh();
            }}
          >
            Close
          </button>
        )}
      </div>
      {error && <p className="field-err" role="alert">{error}</p>}
    </div>
  );
}

// Shown above the Stripe form: people enter their Social Security number and bank details here, so say plainly where that goes.
function SecureNote() {
  return (
    <div className="connect-secure">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 1a5 5 0 0 0-5 5v4H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 9V6a3 3 0 0 1 6 0v4H9Zm3 4a2 2 0 0 1 1 3.73V20h-2v-2.27A2 2 0 0 1 12 14Z"
        />
      </svg>
      <div>
        <p className="connect-secure-title">Secure, and handled by Stripe</p>
        <p>
          The form below is Stripe's own, running inside this page. Your ID, Social Security number and bank details go
          straight to Stripe over an encrypted connection. watchmyfilm never sees or stores your full Social Security
          number or bank account number.
        </p>
        <p>
          Stripe processes payments for millions of businesses and is certified to the payment industry's highest
          security standard (PCI Level 1). It asks for these details because US law requires payment companies to
          verify who they pay.
        </p>
      </div>
    </div>
  );
}
