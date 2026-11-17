import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { pricing } from "./config";
import { CONTACT, LegalPage, Section } from "./legal";

/* Terms of Service. A plain-language draft for review; not legal advice. */

const pct = (n: number) => `${Math.round(n * 100)}%`;
const usd = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;
const { standard, secure } = pricing.tiers;

function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms cover your use of watchmyfilm.online, operated by Brian Hedden (“we”, “us”). They apply to filmmakers
          who create an account to sell a film, and to viewers who rent, buy or watch a film on a watch page we host. By
          creating an account, paying, or using a watch page, you agree to them.
        </p>
      }
    >
      <Section id="service" title="What we do">
        <p>
          We build and host a watch page for your film, with its own web address, where viewers can rent or buy it. Sales
          are paid into your own Stripe account. The film itself plays from your Vimeo account (Standard plan) or from
          protected streaming we host (Secure plan).
        </p>
      </Section>

      <Section id="accounts" title="Your account">
        <ul>
          <li>You must be at least 18 to create a filmmaker account, and the information you give us must be accurate.</li>
          <li>
            We sign you in with one-time links sent to your email, or an optional password. Keep access to your email and
            password secure: anyone who can open your sign-in emails can get into your account.
          </li>
          <li>Tell us right away at {CONTACT} if you think someone else has used your account.</li>
        </ul>
      </Section>

      <Section id="fees" title="Fees">
        <ul>
          <li>
            <strong>Setup fee:</strong> {usd(pricing.setupFee)} per film, paid once when you submit it for review, unless we
            give you a code that waives it. If we don't approve your film, we refund the setup fee in full. Once your film is
            approved, the setup fee isn't refundable.
          </li>
          <li>
            <strong>Platform fee per sale:</strong> {pct(standard.percent)} (at least {usd(standard.minimum)}) on the Standard
            plan, or {pct(secure.percent)} (at least {usd(secure.minimum)}) on the Secure plan. This applies to rentals,
            purchases and pay-what-you-want payments made through your watch page.
          </li>
          <li>Stripe's own processing fees are separate and are charged by Stripe.</li>
          <li>There is no monthly fee. We'll give you at least 30 days' notice by email before changing fees.</li>
          <li>
            Tips sent through Venmo, PayPal or Zelle go directly to you. We aren't part of those payments and take no fee
            on them.
          </li>
        </ul>
      </Section>

      <Section id="filmmakers" title="Your film and your responsibilities">
        <ul>
          <li>
            You must own or have the rights to everything you upload or link: the film, trailer, bonus videos, images,
            music and text. You keep all your rights. You give us permission to host, display and stream it on your watch
            page and to show your title, images and description when promoting the service, only for as long as your
            page is up.
          </li>
          <li>
            Your film must be legal where it's sold and must not infringe anyone's rights, be sexually explicit involving
            anyone under 18, or promote violence or hate against people.
          </li>
          <li>
            You're the seller. Sales go to your Stripe account, and you're responsible for your Stripe account and its
            terms, for taxes on your sales, and for viewers' questions, refunds and chargebacks. If you use the Standard
            plan, you're also responsible for your Vimeo account and its terms.
          </li>
          <li>
            We review every film before it goes live and may ask for changes or decline it. You choose when an approved
            film goes live, and you can hide it at any time.
          </li>
        </ul>
      </Section>

      <Section id="viewers" title="For viewers">
        <ul>
          <li>
            Rentals and purchases are for your personal, non-commercial viewing. No public screenings, rebroadcasting,
            copying, downloading or sharing your access with others.
          </li>
          <li>
            A rental must be started within the days shown on the watch page, and then finished within the hours shown.
          </li>
          <li>
            A purchase lets you watch the film on its watch page for as long as the filmmaker keeps it available there. If
            a film is hidden or removed, access may pause or end.
          </li>
          <li>
            The filmmaker is the seller of the film. For refunds, contact the filmmaker or us at {CONTACT} and we'll pass
            your request on.
          </li>
        </ul>
      </Section>

      <Section id="rules" title="Things you can't do">
        <ul>
          <li>Break the law, infringe others' rights, or upload anything harmful (like malware).</li>
          <li>Try to get around a paywall, rental window, or access control, or help anyone else do so.</li>
          <li>Interfere with the service, overload it, or access accounts or data that aren't yours.</li>
        </ul>
        <p>We may remove content or suspend an account that breaks these terms, and we'll tell you why when we can.</p>
      </Section>

      <Section id="ending" title="Ending">
        <p>
          You can close your account at any time by emailing {CONTACT}. We may end the service for a film or account that
          breaks these terms, or stop offering the service with at least 30 days' notice. Fees already earned aren't
          refundable, except as described above.
        </p>
      </Section>

      <Section id="liability" title="Disclaimers and liability">
        <p>
          We work hard to keep watch pages running, but the service is provided “as is”. We can't promise it will always be
          available or error-free, or that your film will earn a particular amount. To the extent the law allows, we aren't
          liable for indirect or lost-profit damages, and our total liability to you is limited to the fees you paid us in
          the 12 months before the claim. You agree to cover our costs from claims caused by content you upload or by your
          breach of these terms.
        </p>
      </Section>

      <Section id="general" title="General">
        <p>
          These terms are governed by the laws of the State of Colorado, USA. If we change them, we'll post the new version
          here with a new effective date, and email filmmakers about significant changes. If any part is found
          unenforceable, the rest still applies.
        </p>
      </Section>
    </LegalPage>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Terms />
  </StrictMode>
);
