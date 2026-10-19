import type { Metadata } from "next";
import { ContactDetail } from "@/features/crm/contact-detail";

export const metadata: Metadata = { title: "Fiche contact" };

export default async function Page({ params }: PageProps<"/contacts/[id]">) {
  const { id } = await params;
  return <ContactDetail id={id} />;
}
