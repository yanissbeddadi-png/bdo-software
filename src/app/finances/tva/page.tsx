import type { Metadata } from "next";
import { VatPage } from "@/features/finance/vat";

export const metadata: Metadata = { title: "TVA" };

export default function Page() {
  return <VatPage />;
}
