import type { Metadata } from "next";
import { InvoicesPage } from "@/features/finance/invoices";

export const metadata: Metadata = { title: "Factures" };

export default function Page() {
  return <InvoicesPage />;
}
