import type { Metadata } from "next";
import { AnalyticsPage } from "@/features/analytics/analytics";

export const metadata: Metadata = { title: "Analyses" };

export default function Page() {
  return <AnalyticsPage />;
}
