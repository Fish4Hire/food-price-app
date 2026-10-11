import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { BasketMark } from "@/components/BasketMark";
import { HeaderAccount, SignInLink } from "@/components/HeaderAccount";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://getcheapereats.com"),
  title: {
    default: "Cheaper Eats · Grocery prices compared",
    template: "%s · Cheaper Eats",
  },
  description:
    "What 21 grocery staples cost in 7 U.S. cities, checked every morning. Compare cities and stores, find sales and see how prices stack up against the U.S. average.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Proves to Impact (Walmart's affiliate network) that we own this site. Keep it. */}
        <meta
          name="impact-site-verification"
          // @ts-expect-error Impact reads a non-standard `value` attribute
          value="bcea5ec1-af52-424a-9ea7-4d8a7bf123c4"
          content="bcea5ec1-af52-424a-9ea7-4d8a7bf123c4"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70 sticky top-0 z-20">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <BasketMark className="h-7 w-7" />
              <span className="text-lg">Cheaper Eats</span>
              <span className="hidden text-sm font-normal text-muted sm:inline">
                Grocery prices, compared
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-full px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
                Prices
              </Link>
              <Link href="/list" className="rounded-full px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
                My list
              </Link>
              <Link href="/about" className="hidden rounded-full px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline">
                How it works
              </Link>
              {/* Reads the login, so it streams in without holding up the page */}
              <Suspense fallback={<SignInLink />}>
                <HeaderAccount />
              </Suspense>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
            <p>Prices from the Kroger public API, checked every morning. Shelf prices can differ in store.</p>
            <p className="flex gap-4">
              <Link href="/privacy" className="hover:text-ink">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-ink">
                Terms
              </Link>
              <Link href="/about" className="hover:text-ink">
                How it works
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
