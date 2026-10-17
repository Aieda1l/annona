"use client";

import type { DonationCard } from "@/contracts";
import { DonationDetail } from "./DonationDetail";

/**
 * Fixture view for design review and screenshots. It lives in a client component so the server page passes only
 * data across the boundary. Every action is refused with an explicit message; nothing is sent anywhere.
 */
export function FixtureDonationDetail({ card }: { card: DonationCard }) {
  return (
    <>
      <p className="bg-amber-100 p-2 text-center text-sm font-semibold text-amber-950">
        FIXTURE DATA — not live server state. Actions are disabled.
      </p>
      <DonationDetail
        card={card}
        onAction={() => {
          throw new Error("FIXTURE: operator actions are disabled on fixture data.");
        }}
        onHandoff={async () => ({ ok: false, error: "FIXTURE: handoff is disabled on fixture data." })}
      />
    </>
  );
}
