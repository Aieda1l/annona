import type { Metadata } from "next";
import { LinkVerification } from "@/features/intake/components";

// The donor's one-time checklist (D-031, CONTRACTS §8.4). The token lives in the URL fragment, which the browser
// never sends to the server; LinkVerification (Dev 1) reads it client-side. This page needs no session and loads
// nothing third-party. The HTTP headers (Referrer-Policy and Cache-Control: no-store) are set in next.config.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your donation details",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function VerifyPage() {
  return (
    <main className="mx-auto w-full max-w-xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-slate-900">Confirm your donation details</h1>
      <p className="rounded border border-slate-500 bg-slate-50 p-3 text-sm text-slate-900">
        <strong>Synthetic demo.</strong> You are the source of these facts: Annona records what you confirm below and
        does not check it. The AI summary is only a guess to help you fill this in.
      </p>
      <LinkVerification />
    </main>
  );
}
