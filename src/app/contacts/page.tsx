import type { Metadata } from "next";
import { ContactsPage } from "@/features/crm/contacts";

export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
  return <ContactsPage />;
}
