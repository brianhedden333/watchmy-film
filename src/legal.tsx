import type { ReactNode } from "react";
import { site } from "./config";
import "./styles.css";
import "./legal.css";

/* Shared frame for the Terms of Service and Privacy Policy pages. */

const home = import.meta.env.BASE_URL;
export const CONTACT = "hello@watchmyfilm.online";
export const EFFECTIVE = "November 19, 2026";

export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="legal">
      <header className="legal-head">
        <div className="wrap legal-head-inner">
          <a href={home} className="logo-link" aria-label={`${site.name} home`}>
            <img src={`${home}brand/watchmyfilm-logo-white.png`} alt="" width={600} height={163} className="legal-logo" />
          </a>
          <nav aria-label="Legal">
            <a href={`${home}terms/`} aria-current={location.pathname.startsWith("/terms") ? "page" : undefined}>
              Terms
            </a>
            <a href={`${home}privacy/`} aria-current={location.pathname.startsWith("/privacy") ? "page" : undefined}>
              Privacy
            </a>
          </nav>
        </div>
      </header>
      <main className="wrap legal-main">
        <article>
          <h1>{title}</h1>
          <p className="legal-date">Effective {EFFECTIVE}</p>
          <div className="legal-intro">{intro}</div>
          {children}
          <p className="legal-contact">
            Questions? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </article>
      </main>
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  );
}
