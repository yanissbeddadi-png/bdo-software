import type { Metadata } from "next";
import { CatalogPage } from "@/features/catalog/catalog";

export const metadata: Metadata = { title: "Produits et services" };

export default function Page() {
  return <CatalogPage />;
}
