import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="October 12, 2026"
      intro={
        <p>
          These terms explain the rules for using Cheaper Eats (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By using the site or
          creating an account, you agree to them. If you don&apos;t agree, please don&apos;t use Cheaper Eats.
        </p>
      }
    >
      <LegalSection title="1. What Cheaper Eats is">
        <p>
          Cheaper Eats collects publicly available grocery prices and shows them so you can compare stores, find sales
          and plan cheaper shopping. It&apos;s an information service: we don&apos;t sell groceries, and we can&apos;t
          guarantee what a store will charge you.
        </p>
      </LegalSection>

      <LegalSection title="2. Prices may be wrong or out of date">
        <p>
          Grocery prices come from third parties, mainly Kroger&apos;s public API, and are usually checked once a day.
          Restaurant menu prices are read from each restaurant&apos;s own website, usually once a week, and are read
          automatically, so a dish or price can be misread or out of date. Stores
          change prices and run out of items, sale prices end, and the price at the register (including digital coupons,
          loyalty pricing, taxes and fees) can differ from what we show. Matching products, sizes and price-per-unit
          comparisons are done automatically and can contain mistakes.
        </p>
        <p>
          <strong>
            Always check the price at the store before you rely on it. We aren&apos;t responsible for differences between
            our information and actual prices.
          </strong>
        </p>
      </LegalSection>

      <LegalSection title="3. Your account">
        <ul>
          <li>Use an email address you control, and keep access to it secure: anyone with access to your email can sign in as you.</li>
          <li>Accounts are for one person and for personal, non-commercial use.</li>
          <li>You must be at least 13 years old to create an account.</li>
          <li>
            You can stop using Cheaper Eats and delete your account at any time from your account page (see our{" "}
            <Link href="/privacy">privacy policy</Link>).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <p>Please don&apos;t:</p>
        <ul>
          <li>Copy our data in bulk, or use bots, scrapers or other automated tools to access the site.</li>
          <li>Try to break, overload or get around the site&apos;s security, or access other people&apos;s accounts.</li>
          <li>Use Cheaper Eats for anything unlawful, or in a way that harms others.</li>
        </ul>
        <p>We may limit, suspend or close accounts that break these rules.</p>
      </LegalSection>

      <LegalSection title="5. Other companies">
        <p>
          Cheaper Eats is independent. We aren&apos;t affiliated with, endorsed by or sponsored by the restaurants we list, Kroger, its stores
          (such as Ralphs, King Soopers, Fry&apos;s or QFC), Walmart, the Bureau of Labor Statistics or any other store or
          brand we mention. Store names, brand names and product images belong to their owners and are used only to
          identify products and stores.
        </p>
        <p>
          Some links may take you to other websites. We aren&apos;t responsible for their content or practices. In the
          future, some links to stores may be affiliate links, which means we may earn a small commission if you buy
          something, at no extra cost to you. We&apos;ll label these links when we use them.
        </p>
      </LegalSection>

      <LegalSection title="6. Free service and future paid plans">
        <p>
          Cheaper Eats is currently free. We may offer paid features in the future. If we do, prices and any additional
          terms will be shown clearly before you sign up, and nothing will be charged without your agreement.
        </p>
      </LegalSection>

      <LegalSection title="7. Our content">
        <p>
          The site&apos;s design, text and the way we organize and present price information belong to Cheaper Eats. You
          may use the site for your own personal shopping, and share links to it.
        </p>
      </LegalSection>

      <LegalSection title="8. No warranties">
        <p>
          Cheaper Eats is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent allowed by
          law, we make no promises that the site will always be available, error-free or accurate, or that it will help
          you save a particular amount of money.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
        <p>
          To the fullest extent allowed by law, Cheaper Eats won&apos;t be liable for any indirect, incidental or
          consequential damages, or for any losses resulting from relying on information on the site, such as paying a
          different price than the one shown. Because the service is free, our total liability to you for any claim is
          limited to $50. Some places don&apos;t allow these limits, so they may not apply to you.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes and ending the service">
        <p>
          We may update these terms. If we make significant changes, we&apos;ll update this page and its date, and let
          account holders know by email. We may also change or stop offering parts of Cheaper Eats at any time.
        </p>
      </LegalSection>

      <LegalSection title="11. Governing law">
        <p>These terms are governed by the laws of the State of Texas, United States.</p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          Questions about these terms: <ContactLink />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
