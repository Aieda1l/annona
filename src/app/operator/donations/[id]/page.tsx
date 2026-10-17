import { DONATION_CARD_FIXTURES } from "@/contracts";
import { FixtureDonationDetail } from "@/components/dashboard/FixtureDonationDetail";
import { LiveDonationDetail } from "@/components/dashboard/LiveDonationDetail";

// `/operator/donations/:id` shows live server state. `?fixture=1` renders a typed fixture card for design review
// and screenshots, loudly labeled; it never stands in for live data when the server fails.
export default async function OperatorDonationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fixture?: string }>;
}) {
  const { id } = await params;
  const { fixture } = await searchParams;
  if (fixture === "1") {
    const card = DONATION_CARD_FIXTURES.find((c) => c.id === id);
    if (!card) {
      return (
        <p role="alert" className="p-4 text-sm">
          FIXTURE DATA: no fixture card has that id.
        </p>
      );
    }
    return <FixtureDonationDetail card={card} />;
  }
  return <LiveDonationDetail id={id} />;
}
