import type { Metadata, Viewport } from "next";
import { Geist_Mono, Lexend, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/layout/AppHeader";
import { LiveModeBanner } from "@/components/layout/LiveModeBanner";

// next/font downloads these at build time and serves them from this origin, so no page (including /v) makes a
// third-party font request at runtime. Pairing from design-system/annona/MASTER.md: Lexend headings, Source Sans 3 body.
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"], display: "swap" });
const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Annona", template: "%s · Annona" },
  description: "Safety-aware surplus-food coordination prototype (synthetic demo data)",
};

export const viewport: Viewport = {
  themeColor: "#f7f6f1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${lexend.variable} ${sourceSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <AppHeader />
        <LiveModeBanner />
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
