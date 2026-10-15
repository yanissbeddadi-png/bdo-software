import type { Metadata } from "next";
import { SubscriptionsPage } from "@/features/finance/subscriptions";

export const metadata: Metadata = { title: "Revenus récurrents" };

export default function Page() {
  return <SubscriptionsPage />;
}
