import type { Metadata } from "next";
import { ActivitiesPage } from "@/features/crm/activities";

export const metadata: Metadata = { title: "Activités" };

export default function Page() {
  return <ActivitiesPage />;
}
