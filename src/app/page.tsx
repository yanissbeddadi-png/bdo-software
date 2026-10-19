import type { Metadata } from "next";
import { CrmDashboard } from "@/features/dashboard/crm-dashboard";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default function HomePage() {
  return <CrmDashboard />;
}
