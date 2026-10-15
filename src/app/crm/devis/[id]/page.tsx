import type { Metadata } from "next";
import { QuoteDetail } from "@/features/crm/leads-quotes-activities";

export const metadata: Metadata = { title: "Devis" };

export default async function Page({ params }: PageProps<"/crm/devis/[id]">) {
  const { id } = await params;
  return <QuoteDetail id={id} />;
}
