import type { Metadata } from "next";
import { CommandCenter } from "@/features/dashboard/command-center";

export const metadata: Metadata = { title: "Command Center" };

export default function HomePage() {
  return <CommandCenter />;
}
