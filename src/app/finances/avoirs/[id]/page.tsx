import type { Metadata } from "next";
import { CreditNoteDetail } from "@/features/finance/credit-notes";

export const metadata: Metadata = { title: "Avoir" };

export default async function Page({ params }: PageProps<"/finances/avoirs/[id]">) {
  const { id } = await params;
  return <CreditNoteDetail id={id} />;
}
