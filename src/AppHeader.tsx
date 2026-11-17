import { useEffect, useId, useRef, useState } from "react";
import { site } from "./config";
import { signOut, type User } from "./api";

/* Header for the signed-in pages: logo on the left, account menu (Dashboard, Account, Sign out) on the right. */

const home = import.meta.env.BASE_URL;

export function AppHeader({ user }: { user: User | null | undefined }) {
  return (
    <header className="dash-head">
      <div className="wrap dash-head-inner">
        <a href={user ? `${home}dashboard/` : home} className="logo-link" aria-label={user ? "Dashboard" : `${site.name} home`}>
          <img src={`${home}brand/watchmyfilm-logo-white.png`} alt="" width={600} height={163} className="app-logo" />
        </a>
        {user && <UserMenu user={user} />}
      </div>
    </header>
  );
}

function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const here = location.pathname;

  // Close on a click outside or Escape (Escape returns focus to the button).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (path: string, label: string) => (
    <li>
      <a href={`${home}${path}`} aria-current={here.startsWith(`/${path}`) ? "page" : undefined}>
        {label}
      </a>
    </li>
  );

  return (
    <div className="user-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="user-menu-btn"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="user-menu-name">{user.name || user.email}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {open && (
        <ul id={menuId} className="user-menu-list">
          {user.name && <li className="user-menu-email">{user.email}</li>}
          {item("dashboard/", "Dashboard")}
          {item("account/", "Account")}
          {user.isAdmin && item("admin/", "Admin")}
          <li>
            <button type="button" onClick={() => signOut().finally(() => location.assign(home))}>
              Sign out
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
