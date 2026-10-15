import type { Metadata } from "next";
import { ActivitiesPage } from "@/features/crm/leads-quotes-activities";

export const metadata: Metadata = { title: "Activités commerciales" };

export default function Page() {
  return <ActivitiesPage />;
}
