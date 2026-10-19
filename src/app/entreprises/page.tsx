import type { Metadata } from "next";
import { CompaniesPage } from "@/features/crm/companies";

export const metadata: Metadata = { title: "Entreprises clientes" };

export default function Page() {
  return <CompaniesPage />;
}
