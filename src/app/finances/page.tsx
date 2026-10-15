import type { Metadata } from "next";
import { FinanceOverview } from "@/features/finance/overview";

export const metadata: Metadata = { title: "Finances" };

export default function Page() {
  return <FinanceOverview />;
}
