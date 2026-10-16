import type { Metadata } from "next";
import { OfficePage } from "@/features/office/office-page";

export const metadata: Metadata = { title: "Bureaux" };

export default function Page() {
  return <OfficePage />;
}
