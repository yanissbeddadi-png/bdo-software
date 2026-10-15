import type { Metadata } from "next";
import { ClientDetail } from "@/features/clients/clients";

export const metadata: Metadata = { title: "Fiche client" };

export default async function Page({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  return <ClientDetail id={id} />;
}
