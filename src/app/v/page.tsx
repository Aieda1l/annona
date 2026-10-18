import type { Metadata } from "next";
import { LinkVerification } from "@/features/intake/components";

// The donor's one-time checklist (D-031, CONTRACTS §8.4). The token lives in the URL fragment, which the browser
// never sends to the server; LinkVerification (Dev 1) reads it client-side. This page needs no session and loads
// nothing third-party. force-dynamic supplies Cache-Control: no-store today; the Referrer-Policy HTTP header is
// NOT set yet (TODO: headers() in next.config, chore PR). Until then only the no-referrer meta tag applies.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your donation details",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function VerifyPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-1.5">
        <p className="text-xs font-semibold tracking-wider text-primary uppercase">One-time checklist</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">Confirm your donation details</h1>
      </header>
      <p className="rounded-xl border border-offer-border bg-offer-subtle px-4 py-3 text-sm leading-relaxed text-offer">
        <strong>Synthetic demo.</strong> You are the source of these facts: Annona records what you confirm below and
        does not check it. The AI summary is only a guess to help you fill this in.
      </p>
      <LinkVerification />
    </main>
  );
}
