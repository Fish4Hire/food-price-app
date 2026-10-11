import { cacheLife } from "next/cache";
import type { Metadata } from "next";
import { getPriceData } from "@/lib/data";
import { groupMetros } from "@/lib/model";

export const metadata: Metadata = { title: "How it works" };

export default async function AboutPage() {
  "use cache";
  cacheLife("hours");
  const { stores, products } = await getPriceData();
  const categories = [...new Set(products.map((p) => p.category))];
  const metros = groupMetros(stores);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h1>
      <p className="mt-3 text-lg text-ink-2">
        Cheaper Eats tracks what everyday groceries cost across U.S. cities, so you can see where prices are lowest, which
        store is cheapest and when prices move.
      </p>

      <div className="mt-10 space-y-10">
        <Section title="Where the prices come from">
          <p>
            Every morning a script asks the Kroger public API for current shelf prices, including sale prices, at{" "}
            {metros.reduce((count, m) => count + m.storeIds.length, 0)} stores in {metros.length} cities. Kroger runs stores under several names, such as King Soopers
            in Denver, Ralphs in Los Angeles and QFC in Seattle.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {metros.map((metro) => (
              <div key={metro.name} className="rounded-xl border border-line bg-surface p-4">
                <p className="text-sm font-semibold text-ink">{metro.name}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {stores
                    .filter((s) => metro.storeIds.includes(s.id))
                    .map((s) => (
                      <li key={s.id}>
                        <span className="text-ink">{s.name}</span>
                        <span className="block text-muted">
                          {s.address_line1}, {s.zip_code}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3">
            Every price check is saved with its date and never changed, so the history builds up day by day.
          </p>
        </Section>

        <Section title="The basket">
          <p>
            The basket is {products.length} staples a household might buy in a typical week. The headline number adds up the
            lowest price for each one, in the amounts shown here.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {categories.map((category) => (
              <div key={category} className="rounded-xl border border-line bg-surface p-4">
                <p className="text-sm font-semibold text-ink">{category}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {products
                    .filter((p) => p.category === category)
                    .map((p) => (
                      <li key={p.slug} className="flex justify-between gap-3">
                        <span>{p.name}</span>
                        <span className="whitespace-nowrap text-muted">
                          {p.basket_qty} {p.unit_label}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section title="How products are matched">
          <p>
            A search for &ldquo;bananas&rdquo; also returns banana chips and smoothies, so each basket item has rules: words
            that must appear (like &ldquo;milk&rdquo; and &ldquo;2%&rdquo;), words that rule a product out (like
            &ldquo;chocolate&rdquo; or &ldquo;organic&rdquo;), and an allowed package size. Every brand that passes counts.
          </p>
          <p className="mt-3">
            Products are compared by price per unit (per gallon, pound, dozen or ounce), so a 10 lb bag and a 5 lb bag can be
            compared fairly. The cheapest price per unit wins.
          </p>
        </Section>

        <Section title="The U.S. average">
          <p>
            For items the government tracks, Cheaper Eats compares prices with the Bureau of Labor Statistics&apos; average
            prices, the same survey used to measure inflation. The BLS publishes a U.S. city average for each item every
            month, about two weeks after the month ends.
          </p>
          <p className="mt-3">
            Keep in mind that the BLS averages every brand and store, while Cheaper Eats shows the cheapest option. So our
            prices usually come in below the average. That&apos;s the point: it shows how much you can save by picking the
            cheapest option.
          </p>
        </Section>

        <Section title="Good to know">
          <ul className="list-disc space-y-2 pl-5">
            <li>Prices are the online shelf prices Kroger reports. Digital coupons and loyalty deals aren&apos;t included.</li>
            <li>Items sold by weight (produce, meat) show the price per pound.</li>
            <li>Only products sold at the stores on that day are counted. If an item is out of stock it may not show.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}
