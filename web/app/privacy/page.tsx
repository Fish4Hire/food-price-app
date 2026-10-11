import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy" };

// Keep this page true to what the site actually does. Update it (and the date)
// whenever data handling changes: new services, analytics, payments, etc.
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="October 11, 2026"
      intro={
        <p>
          Cheaper Eats (&ldquo;we&rdquo;) helps you find cheaper groceries. We collect as little personal information as we
          can, we don&apos;t sell it, and we don&apos;t use it for advertising. This page explains exactly what we collect and
          why.
        </p>
      }
    >
      <LegalSection title="1. What we collect">
        <p>
          <strong>If you just browse,</strong> we don&apos;t ask for anything. Like most websites, our hosting provider
          automatically records basic technical information (such as your IP address, browser type and the pages
          requested) to keep the site running and secure.
        </p>
        <p>
          <strong>If you create an account,</strong> we store:
        </p>
        <ul>
          <li>
            <strong>Your email address</strong>, to sign you in. We sign you in with one-time email links, so we never
            have a password for you.
          </li>
          <li>
            <strong>Your home ZIP code</strong>, if you choose to save it, to find grocery stores near you.
          </li>
          <li>
            <strong>Your shopping lists</strong>: the items and quantities you add.
          </li>
          <li>
            <strong>Basic account records</strong>, such as when you signed up and last signed in.
          </li>
        </ul>
        <p>
          We don&apos;t collect your name, street address, phone number, payment details or precise location.
        </p>
      </LegalSection>

      <LegalSection title="2. How we use it">
        <ul>
          <li>To sign you in and keep you signed in.</li>
          <li>To show prices at stores near your ZIP code, and to decide which stores to check prices at each day.</li>
          <li>To save your shopping list and work out the cheapest way to buy it.</li>
          <li>To keep the site secure, fix problems, and respond when you contact us.</li>
        </ul>
        <p>We don&apos;t use your information for advertising, and we don&apos;t build marketing profiles about you.</p>
      </LegalSection>

      <LegalSection title="3. Cookies">
        <p>
          We use cookies only to keep you signed in. We don&apos;t use advertising cookies, analytics cookies or other
          tracking technology. If you block cookies, the site still works, but you won&apos;t be able to sign in.
        </p>
      </LegalSection>

      <LegalSection title="4. Who we share it with">
        <p>
          <strong>We don&apos;t sell or rent your personal information, and we don&apos;t share it for advertising.</strong>{" "}
          We use a few service providers to run the site. They handle data only to provide their service to us:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> stores account data (email, ZIP code, lists) in the United States and sends our
            sign-in emails.
          </li>
          <li>
            <strong>Vercel</strong> hosts the website.
          </li>
          <li>
            <strong>GitHub</strong> runs our daily price check, which reads saved ZIP codes to choose which stores to
            check. ZIP codes are not linked to your email there and aren&apos;t kept in its logs.
          </li>
          <li>
            <strong>Kroger</strong>: to find stores near you and look up prices, we send ZIP codes and product searches to
            Kroger&apos;s public API. We don&apos;t send your email or any other account details.
          </li>
        </ul>
        <p>
          We may also share information if the law requires it, to protect people&apos;s safety or our rights, or as part
          of a business transfer (for example, if Cheaper Eats becomes part of a company), in which case this policy would
          continue to apply.
        </p>
      </LegalSection>

      <LegalSection title="5. Prices and public information">
        <p>
          Grocery prices and the official U.S. averages we show come from public sources (Kroger&apos;s public API and the
          Bureau of Labor Statistics). This information is about stores and products, not about you. Stores we check only
          because a user lives nearby are never shown publicly, so the site doesn&apos;t reveal where our users live.
        </p>
      </LegalSection>

      <LegalSection title="6. How long we keep it, and your choices">
        <ul>
          <li>
            You can change or remove your ZIP code and edit your shopping list at any time on your{" "}
            <Link href="/account">account</Link> and <Link href="/list">list</Link> pages.
          </li>
          <li>
            We keep your account information until you delete your account. You can delete it at any time on your{" "}
            <Link href="/account">account page</Link>: your account, ZIP code and lists are deleted immediately. If you
            can&apos;t sign in, email <ContactLink /> from the address you signed up with and we&apos;ll delete it within 30
            days.
          </li>
          <li>
            You can also ask us for a copy of the information we hold about you, or ask us to correct it, at the same
            address. Depending on where you live, you may have additional privacy rights, and we&apos;ll honor them.
          </li>
          <li>
            Technical logs kept by our providers are deleted on their own schedules, usually within a few weeks.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Security">
        <p>
          All connections to Cheaper Eats are encrypted (HTTPS). Account data is protected by access rules so that each
          person can only see and change their own information. No system is perfectly secure, but we take reasonable
          steps to protect your information, and we&apos;ll tell you if a breach affects you.
        </p>
      </LegalSection>

      <LegalSection title="8. Children">
        <p>
          Cheaper Eats isn&apos;t meant for children under 13, and we don&apos;t knowingly collect information from them.
          If you believe a child has created an account, contact us and we&apos;ll delete it.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to this policy">
        <p>
          If we change how we handle personal information, we&apos;ll update this page and its date. For significant
          changes, such as adding paid plans or new kinds of data, we&apos;ll also let account holders know by email before
          the change takes effect.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Questions or requests about your privacy: <ContactLink />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
