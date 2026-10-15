import type { Metadata } from "next";
import { InvoiceDetail } from "@/features/finance/invoices";

export const metadata: Metadata = { title: "Facture" };

export default async function Page({ params }: PageProps<"/finances/factures/[id]">) {
  const { id } = await params;
  return <InvoiceDetail id={id} />;
}
