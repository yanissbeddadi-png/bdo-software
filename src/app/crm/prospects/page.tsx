import type { Metadata } from "next";
import { LeadsPage } from "@/features/crm/leads-quotes-activities";

export const metadata: Metadata = { title: "Prospects" };

export default function Page() {
  return <LeadsPage />;
}
