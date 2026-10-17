"use client";

import Link from "next/link";
import type { DonationCard } from "@/contracts";
import { formatPacific } from "@/components/dashboard/format";
import { useServerResource } from "@/components/useServerResource";
import { DonorDonationView } from "./DonorDonationView";

/**
 * Polls GET /api/donations/:id with the donor's own session; the server returns the donor projection. This
 * component never requests an operator, dashboard or dispatch route, and never invents a donation on failure.
 */
export function LiveDonorDonation({ id }: { id: string }) {
  const { data: card, failure, lastGoodAt } = useServerResource<DonationCard>(`/api/donations/${id}`);

  return (
    <>
      {failure && (
        <div role="alert" className="mx-auto mt-4 w-full max-w-xl rounded border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950">
          {failure.code === "NOT_AUTHORIZED" ? (
            <p>
              You need to{" "}
              <Link href="/" className="font-medium underline">
                sign in
              </Link>{" "}
              as the donor who created this donation.
            </p>
          ) : (
            <>
              <p className="font-semibold">Donation unavailable: {failure.code}</p>
              <p>{failure.message}</p>
              {card && <p>Showing the last view received (stale{lastGoodAt ? ` since ${formatPacific(lastGoodAt)}` : ""}).</p>}
            </>
          )}
        </div>
      )}
      {card ? <DonorDonationView card={card} /> : !failure && <p className="p-4 text-sm">Loading donation…</p>}
    </>
  );
}
