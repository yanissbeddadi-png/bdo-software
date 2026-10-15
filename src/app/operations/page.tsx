import type { Metadata } from "next";
import { OperationsPage } from "@/features/operations/operations";

export const metadata: Metadata = { title: "Opérations" };

export default function Page() {
  return <OperationsPage />;
}
