import { StrictMode, useEffect, useId, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { api, getMe, type User } from "./api";
import { AppHeader } from "./AppHeader";
import { ConnectStripe } from "./ConnectStripe";
import "./styles.css";
import "./dashboard.css";

/* Account: the filmmaker's name, sign-in email and password. Film settings live on /add-a-film/. */

const home = import.meta.env.BASE_URL;

function Account() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  const refresh = () => getMe().then((u) => (u ? setUser(u) : location.replace(`${home}signin/`)));

  useEffect(() => {
    refresh().catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="dash">
      <AppHeader user={user} />
      <main className="wrap dash-main settings">
        <h1>Account</h1>
        {error && <p className="dash-alert" role="alert">{error}</p>}
        {!user && !error && <p role="status">Loading…</p>}
        {user && (
          <>
            <NameForm user={user} onSaved={refresh} />
            <PasswordForm user={user} onSaved={refresh} />
            <section className="settings-section">
              <h2>Payouts</h2>
              <p className="settings-hint">The Stripe account your film sales are paid into. It's used for all of your films.</p>
              <ConnectStripe initial={user.connect} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function NameForm({ user, onSaved }: { user: User; onSaved: () => Promise<unknown> }) {
  const [name, setName] = useState(user.name || "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const nameId = useId();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState("saving");
    setError("");
    try {
      await api("/auth/me", { method: "PATCH", body: { name } });
      await onSaved();
      setState("saved");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  return (
    <form className="settings-section" onSubmit={onSubmit}>
      <h2>Profile</h2>
      <div className="field">
        <label htmlFor={nameId}>Your name</label>
        <input
          id={nameId}
          value={name}
          maxLength={120}
          autoComplete="name"
          onChange={(e) => {
            setName(e.target.value);
            setState("idle");
          }}
        />
      </div>
      <div className="field">
        <span className="settings-label">Email</span>
        <p className="settings-value">{user.email}</p>
        <p className="settings-hint">This is where sign-in links and updates about your films go. To change it, reply to any of our emails.</p>
      </div>
      <div className="settings-actions">
        <button className="btn btn-small" disabled={state === "saving" || name === (user.name || "")}>
          {state === "saving" ? "Saving…" : "Save name"}
        </button>
        {state === "saved" && <span role="status">Saved.</span>}
        {error && <span className="field-err" role="alert">{error}</span>}
      </div>
    </form>
  );
}

function PasswordForm({ user, onSaved }: { user: User; onSaved: () => Promise<unknown> }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const currentId = useId();
  const newId = useId();
  const changing = user.hasPassword;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setState("saving");
    setError("");
    try {
      await api("/auth/password", { body: { password: data.get("password"), current: data.get("current") } });
      form.reset();
      await onSaved();
      setState("saved");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  return (
    <form className="settings-section" onSubmit={onSubmit}>
      <h2>Password</h2>
      <p className="settings-hint">
        {changing
          ? "You can sign in with your password or an emailed link. Changing your password signs you out on other devices."
          : "You sign in with emailed links. Add a password to sign in without waiting for an email."}
      </p>
      {changing && (
        <div className="field">
          <label htmlFor={currentId}>Current password</label>
          <input id={currentId} name="current" type={show ? "text" : "password"} required autoComplete="current-password" maxLength={200} />
        </div>
      )}
      <div className="field">
        <label htmlFor={newId}>{changing ? "New password" : "Password"}</label>
        <input id={newId} name="password" type={show ? "text" : "password"} required minLength={8} maxLength={200} autoComplete="new-password" />
        <p className="settings-hint">At least 8 characters.</p>
      </div>
      <label className="settings-check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password
      </label>
      <div className="settings-actions">
        <button className="btn btn-small" disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : changing ? "Change password" : "Create password"}
        </button>
        {state === "saved" && <span role="status">Password saved.</span>}
        {error && <span className="field-err" role="alert">{error}</span>}
      </div>
    </form>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Account />
  </StrictMode>
);
