import type { Metadata } from "next";
import { ProjectsPage } from "@/features/projects/projects";

export const metadata: Metadata = { title: "Projets" };

export default function Page() {
  return <ProjectsPage />;
}
