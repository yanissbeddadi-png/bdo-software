import type { Metadata } from "next";
import { QuotesPage } from "@/features/crm/quotes";

export const metadata: Metadata = { title: "Devis" };

export default function Page() {
  return <QuotesPage />;
}
