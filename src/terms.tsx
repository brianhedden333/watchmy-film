import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { pricing } from "./config";
import { CONTACT, LegalPage, Section } from "./legal";

/* Terms of Service. A plain-language draft for review; not legal advice. Keep it in step with how sales work
   (server/src/sales.js: direct charges on the filmmaker's Stripe account, our application fee, refunds, disputes). */

const pct = (n: number) => `${Math.round(n * 100)}%`;
const usd = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;
const { standard } = pricing.tiers;

function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms cover your use of watchmyfilm.online and IndieFilm.club (indiefilm.club and the film pages at its
          addresses), both operated by Brian Hedden (“we”, “us”); in these terms, “watchmyfilm.online” means both. They
          apply to filmmakers who create an account to sell a film, and to viewers who rent, buy or watch a film on a
          watch page we host, with or without an account. One account works on both sites. By creating an account, paying, or using a watch page, you agree to them.
        </p>
      }
    >
      <Section id="service" title="What we do">
        <p>
          We build and host a watch page for your film, with its own web address, where viewers can rent it, buy it, pay
          what they want, or watch it free if you allow that. We're a software platform: you sell your film to your viewers,
          and the money is paid into your own Stripe account through Stripe Connect. The film itself plays from your own
          account, through a private Vimeo link or an unlisted YouTube link that you provide. We don't host the film.
        </p>
      </Section>

      <Section id="accounts" title="Accounts">
        <ul>
          <li>You must be at least 18 to create a filmmaker account, and the information you give us must be accurate.</li>
          <li>
            Viewers don't need an account to rent or buy a film: a link emailed to you after paying gets you back to it. A
            free viewer account is optional and keeps your rentals, purchases and Watch Later list in one library. To pay
            for a film you must be old enough to make the payment where you live, or have a parent's or guardian's
            permission.
          </li>
          <li>
            We sign you in with one-time links sent to your email, or an optional password. Keep access to your email and
            password secure: anyone who can open your sign-in emails can get into your account or your films.
          </li>
          <li>Tell us right away at {CONTACT} if you think someone else has used your account.</li>
        </ul>
      </Section>

      <Section id="stripe" title="Payments through Stripe">
        <p>
          Payment processing services for filmmakers on watchmyfilm.online are provided by Stripe and are subject to the{" "}
          <a href="https://stripe.com/connect-account/legal/full" target="_blank" rel="noopener">
            Stripe Connected Account Agreement
          </a>
          , which includes the{" "}
          <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener">
            Stripe Terms of Service
          </a>{" "}
          (together, the “Stripe Services Agreement”). By agreeing to these terms or continuing to sell on
          watchmyfilm.online, you agree to be bound by the Stripe Services Agreement, as Stripe may change it from time to
          time. As a condition of us enabling payment processing through Stripe, you agree to give us accurate and complete
          information about you and your business, and you authorize us to share it, and transaction information about your
          use of Stripe's payment processing services, with Stripe.
        </p>
        <p>
          You connect your Stripe account on our site. Stripe collects and verifies your identity and bank details
          directly; we don't receive your full Social Security number or bank account number. You manage your Stripe
          account, payouts and receipts in your own Stripe Dashboard. If Stripe restricts your account, Rent, Buy and
          pay-what-you-want stop working on your pages until it's resolved; free viewing and tip jars keep working.
        </p>
      </Section>

      <Section id="fees" title="Fees">
        <ul>
          <li>
            <strong>Platform fee per sale:</strong> {pct(standard.percent)} of the sale (at least {usd(standard.minimum)}).
            It applies to rentals, purchases and pay-what-you-want payments made through your watch page, and Stripe deducts
            it automatically from each sale.
          </li>
          <li>
            <strong>Setup:</strong> There's nothing to pay when you submit a film for review. Setup is a{" "}
            {usd(pricing.setupFee)} cost per film, which we recover by adding up to {usd(pricing.setupSurcharge)} to our
            platform fee on each sale of that film until we've collected {usd(pricing.setupFee)} in total. On small sales we
            add less, so that our fees and Stripe's fee never exceed the sale. After {usd(pricing.setupFee)} is collected,
            only the platform fee applies. If the film never sells enough to cover it, you owe nothing more: we never bill
            you separately for the rest. We may waive this for some films.
          </li>
          <li>
            Stripe's own processing fees are separate. Because each sale is made on your Stripe account, Stripe charges them
            to you. On very small sales (for example a {usd(0.99)} pay-what-you-want payment), the fees can use up most or
            all of the sale; you can set a higher pay-what-you-want minimum on your film page.
          </li>
          <li>
            There is no monthly fee. We'll give you at least 30 days' notice by email before changing fees. A change to how
            setup is charged applies only to films submitted after the change.
          </li>
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
            page and to show your title, images and description when promoting the service (including in Browse, if you
            choose to list it there), only for as long as your page is up.
          </li>
          <li>
            Your film must be legal where it's sold and must not infringe anyone's rights, be sexually explicit involving
            anyone under 18, or promote violence or hate against people.
          </li>
          <li>
            You're the seller. Your business name appears on viewers' card statements and receipts. You're responsible for
            your Stripe account, for viewers' questions, and for refunds, disputes and chargebacks on your sales. You're
            also responsible for the Vimeo or YouTube account your film plays from, and its terms. An unlisted YouTube link
            can be watched by anyone who has it, so we can't stop it being shared outside your watch page.
          </li>
          <li>
            <strong>Taxes:</strong> you're responsible for any sales tax, VAT or other taxes on your sales, and for
            registering where required. Stripe offers tools that can calculate and collect them.
          </li>
          <li>
            We review every film before it goes live and may ask for changes or decline it. You choose when an approved
            film goes live, and you can hide it at any time.
          </li>
        </ul>
      </Section>

      <Section id="refunds" title="Refunds and disputes">
        <ul>
          <li>
            Viewers get access to a film as soon as they pay, so sales are generally final. You (the filmmaker) decide
            whether to give a refund, except where the law requires one, and you issue it from your Stripe Dashboard.
          </li>
          <li>
            <strong>Fees on refunds:</strong> our platform fee on a sale (including any setup amount, which still counts
            toward the film's setup cost) isn't returned when you refund it, and Stripe doesn't return its processing fee
            either. A refund comes out of your Stripe balance.
          </li>
          <li>
            <strong>Full refund:</strong> the viewer's access to that rental or purchase ends.
          </li>
          <li>
            <strong>Partial refund:</strong> the viewer keeps access.
          </li>
          <li>
            <strong>Disputes (chargebacks):</strong> if a viewer disputes a charge with their bank, their access pauses while
            it's decided, and is restored if the dispute is resolved in your favor. Stripe handles disputes on your account
            under its own rules and fees.
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
            A rental must be started within the number of days shown on the watch page. Once you press play, you have the
            number of days shown to finish watching.
          </li>
          <li>
            A purchase lets you watch the film on its watch page for as long as the filmmaker keeps it available there. If
            a film is hidden or removed, access may pause or end.
          </li>
          <li>
            The filmmaker is the seller of the film, and their name appears on your card statement. For a refund or a
            problem with your purchase, contact the filmmaker, or us at {CONTACT} and we'll pass your request on. If a
            purchase is fully refunded, access to it ends.
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
          refundable, except as described above. Closing your watchmyfilm.online account doesn't close your Stripe account;
          you manage that with Stripe.
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
