import type { Metadata } from "next";
import { DonorIntake } from "@/components/donor/DonorIntake";

export const metadata: Metadata = {
  title: "Offer surplus food",
  robots: { index: false, follow: false },
};

export default function DonorNewPage() {
  return <DonorIntake />;
}
