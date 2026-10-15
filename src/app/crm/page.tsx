import type { Metadata } from "next";
import { PipelinePage } from "@/features/crm/pipeline";

export const metadata: Metadata = { title: "Ventes et CRM" };

export default function Page() {
  return <PipelinePage />;
}
