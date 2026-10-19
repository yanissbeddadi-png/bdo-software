import type { Metadata } from "next";
import { MissionsPage } from "@/features/crm/missions";

export const metadata: Metadata = { title: "Missions" };

export default function Page() {
  return <MissionsPage />;
}
