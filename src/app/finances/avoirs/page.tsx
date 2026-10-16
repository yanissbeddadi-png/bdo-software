import type { Metadata } from "next";
import { CreditNotesPage } from "@/features/finance/credit-notes";

export const metadata: Metadata = { title: "Avoirs" };

export default function Page() {
  return <CreditNotesPage />;
}
