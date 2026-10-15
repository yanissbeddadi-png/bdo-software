import type { Metadata } from "next";
import { MissionsPage } from "@/features/missions/missions";

export const metadata: Metadata = { title: "Centre de missions" };

export default function Page() {
  return <MissionsPage />;
}
