import type { Metadata } from "next";
import { CompanyDetail } from "@/features/crm/companies";

export const metadata: Metadata = { title: "Fiche entreprise" };

export default async function Page({ params }: PageProps<"/entreprises/[id]">) {
  const { id } = await params;
  return <CompanyDetail id={id} />;
}
