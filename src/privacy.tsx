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
            Your Stripe account: when you connect Stripe, Stripe collects your identity, business and bank details
            directly, under its own privacy policy. We receive your Stripe account ID and whether it can take payments and
            receive payouts; we don't receive your full Social Security number or bank account number.
          </li>
          <li>
            If you add a tip jar, your Venmo, PayPal.Me or Zelle handle, which is shown publicly on your watch page.
          </li>
          <li>
            Records of your sales: amounts, our fees, Stripe's fees, refunds and disputes, and how much of your film's
            setup cost has been covered, so we can show you your sales and earnings.
          </li>
        </ul>
        <h3>Viewers</h3>
        <ul>
          <li>
            When you rent or buy a film, your email address and what you bought and when, so we can give you access, email
            you a link back to it, and show it in your library. For rentals, we also record when you first pressed play,
            to time your rental. If a purchase is refunded or disputed, we record that too, because it affects your access.
          </li>
          <li>
            If you create a free account, your Watch Later list (films you save from Browse).
          </li>
          <li>
            Card details are entered on Stripe's checkout page and never reach our servers. If you choose to save your
            details with Stripe Link for faster checkout, that's between you and Stripe, under Stripe's terms.
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
          We use one cookie, to keep you signed in (each film's watch page has its own, since it's a separate web address).
          Your browser also remembers a few small things for convenience, such as which page to return to after you sign
          in. We don't use advertising or analytics cookies. Videos on watch pages play through Vimeo or YouTube, and
          checkout and Stripe account setup run through Stripe; each may set its own cookies under its own policies.
        </p>
      </Section>

      <Section id="use" title="How we use it">
        <ul>
          <li>To run the service: sign you in, build and host watch pages, process fees and payments, and give viewers access.</li>
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
            <strong>Filmmakers:</strong> when you rent or buy a film, the payment is made to its filmmaker's own Stripe
            account, so the filmmaker receives your email address, name and the details of your purchase (not your full
            card number). That's how filmmakers own their viewer list. Their use of it is covered by their own practices.
          </li>
          <li>
            <strong>Stripe:</strong> we share filmmakers' account and sale information with Stripe as needed to process
            payments, payouts, refunds and disputes, and to meet Stripe's identity verification and legal requirements.
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
