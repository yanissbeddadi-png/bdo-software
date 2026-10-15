import type { Metadata } from "next";
import { ProgressionPage } from "@/features/progression/progression";

export const metadata: Metadata = { title: "Progression" };

export default function Page() {
  return <ProgressionPage />;
}
