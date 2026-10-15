import type { Metadata } from "next";
import { TeamPage } from "@/features/team/team";

export const metadata: Metadata = { title: "Équipe" };

export default function Page() {
  return <TeamPage />;
}
