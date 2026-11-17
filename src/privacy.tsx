import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CONTACT, LegalPage, Section } from "./legal";

/* Privacy Policy. A plain-language draft for review; not legal advice. Keep it in step with what the code collects. */

function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This explains what information watchmyfilm.online (operated by Brian Hedden, “we”, “us”) collects, why, who we
          share it with, and your choices. We don't sell personal information, and we don't use advertising trackers.
        </p>
      }
    >
      <Section id="collect" title="What we collect">
        <h3>Filmmakers</h3>
        <ul>
          <li>Your email address and, if you add them, your name and a password (stored only as a secure hash).</li>
          <li>
            Your film's details, images and video links, and anything else you enter on your film page, including contact
            details and notes to us.
          </li>
          <li>
            Payout details you give us: the email and account ID of your Stripe account and the country of your bank
            account. If you add a tip jar, your Venmo, PayPal.Me or Zelle handle, which is shown publicly on your watch
            page.
          </li>
          <li>
            Records of your setup fee payment. Card details are entered on Stripe's checkout page and never reach our
            servers.
          </li>
        </ul>
        <h3>Viewers</h3>
        <ul>
          <li>
            When you rent or buy a film, your email address and what you bought and when, so we can give you access and
            show it in your library. Card details are handled by Stripe.
          </li>
        </ul>
        <h3>Everyone</h3>
        <ul>
          <li>
            Basic technical information such as your IP address and browser, used to keep the service secure and to limit
            abuse (for example, too many sign-in requests).
          </li>
          <li>Messages you send us, including through the question form on our home page.</li>
        </ul>
      </Section>

      <Section id="cookies" title="Cookies">
        <p>
          We use one cookie, to keep you signed in. We don't use advertising or analytics cookies. Videos on watch pages
          play through Vimeo or YouTube, which may set their own cookies under their own policies.
        </p>
      </Section>

      <Section id="use" title="How we use it">
        <ul>
          <li>To run the service: sign you in, build and host watch pages, process the setup fee, and give viewers access.</li>
          <li>
            To email you about your account and films: sign-in links, review updates and receipts. We don't send marketing
            email without your permission.
          </li>
          <li>To keep the service secure, prevent fraud and abuse, and meet legal obligations.</li>
        </ul>
      </Section>

      <Section id="share" title="Who we share it with">
        <ul>
          <li>
            <strong>Filmmakers:</strong> when you rent or buy a film, its filmmaker receives your email address and the
            details of your purchase. That's how filmmakers own their viewer list. Their use of it is covered by their own
            practices.
          </li>
          <li>
            <strong>Service providers</strong> that run parts of the service for us: Stripe (payments), Twilio SendGrid
            (email), DigitalOcean (hosting), Cloudflare (network, security and email forwarding), Formspree (our question
            form), and Vimeo and YouTube (video playback).
          </li>
          <li>
            <strong>When required:</strong> if the law requires it, or to protect the rights and safety of our users and
            us.
          </li>
        </ul>
      </Section>

      <Section id="keep" title="How long we keep it">
        <p>
          We keep account and film information while your account is open, and delete it when you ask us to close your
          account, except for payment records, which we keep as long as tax and accounting rules require (generally seven
          years).
        </p>
      </Section>

      <Section id="choices" title="Your choices and rights">
        <p>
          You can see and change most of your information in your account. You can also ask us to send you a copy of your
          information, correct it, or delete it, by emailing {CONTACT}. Depending on where you live (for example California
          or the EU and UK), you may have additional rights, and we'll honor them. We'll respond within 30 days.
        </p>
      </Section>

      <Section id="security" title="Security">
        <p>
          We use encrypted connections (HTTPS), store passwords and sign-in links only as secure hashes, and limit who can
          access our systems. No service can be perfectly secure, but we'll tell you promptly if a breach affects your
          information.
        </p>
      </Section>

      <Section id="other" title="Other things to know">
        <ul>
          <li>Our servers are in the United States, so your information is processed there.</li>
          <li>The service isn't directed to children under 16, and we don't knowingly collect their information.</li>
          <li>If we change this policy, we'll post the new version here with a new effective date and email filmmakers about significant changes.</li>
        </ul>
      </Section>
    </LegalPage>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Privacy />
  </StrictMode>
);
