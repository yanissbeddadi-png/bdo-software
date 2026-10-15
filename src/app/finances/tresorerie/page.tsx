import type { Metadata } from "next";
import { TreasuryPage } from "@/features/finance/treasury";

export const metadata: Metadata = { title: "Trésorerie" };

export default function Page() {
  return <TreasuryPage />;
}
