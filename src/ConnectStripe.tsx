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
    } catch {
      /* keep what we have */
    }
  }

  if (info === undefined) return <p className="small-print">Checking your Stripe account…</p>;

  const active = !!info?.canAcceptPayments;
  const started = !!info?.accountId;

  return (
    <div className="connect-stripe">
      {active ? (
        <p className="setup-paid">✓ Stripe connected. Sales are charged on your own Stripe account.</p>
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
              <ConnectAccountOnboarding
                onExit={() => {
                  setMode("");
                  refresh();
                }}
              />
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
        {!active && mode !== "onboarding" && (
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
