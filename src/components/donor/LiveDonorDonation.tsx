"use client";

import Link from "next/link";
import type { DonationCard } from "@/contracts";
import { formatPacific } from "@/components/dashboard/format";
import { useServerResource } from "@/components/useServerResource";
import { DonorDonationView } from "./DonorDonationView";
import { PageContainer } from "@/components/layout/PageHeader";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Polls GET /api/donations/:id with the donor's own session; the server returns the donor projection. This
 * component never requests an operator, dashboard or dispatch route, and never invents a donation on failure.
 */
export function LiveDonorDonation({ id }: { id: string }) {
  const { data: card, failure, lastGoodAt } = useServerResource<DonationCard>(`/api/donations/${id}`);

  const notice = failure && (
    <Notice role="alert" tone="warning" title={failure.code === "NOT_AUTHORIZED" ? undefined : `Donation unavailable: ${failure.code}`}>
      {failure.code === "NOT_AUTHORIZED" ? (
        <p>
          You need to <Link href="/">sign in</Link> as the donor who created this donation.
        </p>
      ) : (
        <>
          <p>{failure.message}</p>
          {card && <p>Showing the last view received (stale{lastGoodAt ? ` since ${formatPacific(lastGoodAt)}` : ""}).</p>}
        </>
      )}
    </Notice>
  );

  return (
    <>
      {notice && (
        <div className="mx-auto w-full max-w-2xl px-4 pt-6 sm:px-6">{notice}</div>
      )}
      {card ? (
        <DonorDonationView card={card} />
      ) : (
        !failure && (
          <PageContainer size="narrow" className="space-y-4">
            <div role="status" aria-label="Loading donation" className="space-y-4">
              <span className="sr-only">Loading donation…</span>
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-44 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          </PageContainer>
        )
      )}
    </>
  );
}
