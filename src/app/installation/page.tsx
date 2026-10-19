import type { Metadata } from "next";
import { InstallPage } from "@/features/auth/auth-pages";

export const metadata: Metadata = { title: "Installation" };

export default function Page() {
  return <InstallPage />;
}
