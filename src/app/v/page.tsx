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
    <main className="mx-auto w-full max-w-xl space-y-4 p-4">
      <header className="annona-hero rounded-2xl px-6 py-5 shadow-sm">
        <p className="annona-eyebrow text-xs font-semibold tracking-widest uppercase">Annona · Donor checklist</p>
        <h1 className="mt-1 text-3xl font-bold">Confirm your donation details</h1>
      </header>
      <p className="rounded-lg border border-[#e8833a] border-l-4 bg-[#fff7ee] p-3 text-sm text-[#17301f]">
        <strong>Synthetic demo.</strong> You are the source of these facts: Annona records what you confirm below and
        does not check it. The AI summary is only a guess to help you fill this in.
      </p>
      <LinkVerification />
    </main>
  );
}
