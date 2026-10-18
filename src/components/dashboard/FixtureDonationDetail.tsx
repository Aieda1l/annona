"use client";

import type { DonationCard } from "@/contracts";
import { Notice } from "@/components/ui/notice";
import { DonationDetail } from "./DonationDetail";

/**
 * Fixture view for design review and screenshots. It lives in a client component so the server page passes only
 * data across the boundary. Every action is refused with an explicit message; nothing is sent anywhere.
 */
export function FixtureDonationDetail({ card }: { card: DonationCard }) {
  return (
    <>
      <DonationDetail
        card={card}
        notice={
          <Notice tone="synthetic">
            <p className="font-semibold">FIXTURE DATA — not live server state. Actions are disabled.</p>
          </Notice>
        }
        onAction={() => {
          throw new Error("FIXTURE: operator actions are disabled on fixture data.");
        }}
        onHandoff={async () => ({ ok: false, error: "FIXTURE: handoff is disabled on fixture data." })}
      />
    </>
  );
}
