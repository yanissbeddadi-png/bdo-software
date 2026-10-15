import type { Metadata } from "next";
import { ClientsPage } from "@/features/clients/clients";

export const metadata: Metadata = { title: "Clients" };

export default function Page() {
  return <ClientsPage />;
}
