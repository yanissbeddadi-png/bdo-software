import type { Metadata } from "next";
import { StatisticsPage } from "@/features/crm/statistics";

export const metadata: Metadata = { title: "Statistiques" };

export default function Page() {
  return <StatisticsPage />;
}
