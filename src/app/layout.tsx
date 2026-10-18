import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import "./globals.css";
import { LiveModeBanner } from "@/components/layout/LiveModeBanner";
import { SignOutButton } from "@/components/layout/SignOutButton";

// Fira pairing from the ui-ux-pro-max dashboard recommendation: Fira Sans for text, Fira Code for ids and times.
const geistSans = Fira_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Fira_Code({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Annona",
  description: "Safety-aware surplus-food coordination prototype (synthetic demo data)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LiveModeBanner />
        <SignOutButton />
        {children}
      </body>
    </html>
  );
}
