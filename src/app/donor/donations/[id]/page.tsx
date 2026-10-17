import type { Metadata } from "next";
import { LiveDonorDonation } from "@/components/donor/LiveDonorDonation";

export const metadata: Metadata = {
  title: "Your donation",
  robots: { index: false, follow: false },
};

export default async function DonorDonationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveDonorDonation id={id} />;
}
