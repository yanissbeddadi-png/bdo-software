import type { Metadata } from "next";
import { AssistantPage } from "@/features/assistant/assistant-page";

export const metadata: Metadata = { title: "Assistant" };

export default function Page() {
  return <AssistantPage />;
}
