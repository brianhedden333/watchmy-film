import { useEffect, useId, useRef, useState } from "react";
import { site } from "./config";
import { signOut, type User } from "./api";

/* Header for the signed-in pages: logo on the left, account menu on the right. Filmmakers who also buy films have
   two libraries: My Films (the films they sell) and My Library (films they've rented, bought or saved). */

const home = import.meta.env.BASE_URL;

export function AppHeader({ user }: { user: User | null | undefined }) {
  return (
    <header className="dash-head">
      <div className="wrap dash-head-inner">
        <a
          href={user ? `${home}${user.isAdmin ? "admin/" : user.hasFilms ? "dashboard/" : "library/"}` : home}
          className="logo-link"
          aria-label={user ? (user.isAdmin ? "Admin" : user.hasFilms ? "My Films" : "My Library") : `${site.name} home`}
        >
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
          {user.isAdmin && item("admin/", "Admin")}
          {user.hasFilms && item("dashboard/", "My Films")}
          {item("library/", "My Library")}
          {item("browse/", "Browse films")}
          {item("account/", "Account")}
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
