import type { Metadata } from "next";
import { ExpensesPage } from "@/features/finance/expenses";

export const metadata: Metadata = { title: "Dépenses" };

export default function Page() {
  return <ExpensesPage />;
}
