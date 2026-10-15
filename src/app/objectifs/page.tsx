import type { Metadata } from "next";
import { GoalsPage } from "@/features/goals/goals";

export const metadata: Metadata = { title: "Objectifs" };

export default function Page() {
  return <GoalsPage />;
}
