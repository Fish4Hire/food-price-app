import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { BasketMark } from "@/components/BasketMark";
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
  title: {
    default: "Basket · Houston grocery prices",
    template: "%s · Basket",
  },
  description:
    "What 21 grocery staples cost at Houston Kroger stores, checked every morning. Compare stores, find sales and watch prices change.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70 sticky top-0 z-20">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <BasketMark className="h-7 w-7" />
              <span className="text-lg">Basket</span>
              <span className="hidden text-sm font-normal text-muted sm:inline">
                Houston grocery prices
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-full px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
                Prices
              </Link>
              <Link href="/about" className="rounded-full px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
                How it works
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
            <p>Prices from the Kroger public API, checked every morning.</p>
            <p>Shelf prices can differ from what you pay in store.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
