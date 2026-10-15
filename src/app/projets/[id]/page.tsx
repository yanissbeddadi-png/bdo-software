import type { Metadata } from "next";
import { ProjectDetail } from "@/features/projects/projects";

export const metadata: Metadata = { title: "Projet" };

export default async function Page({ params }: PageProps<"/projets/[id]">) {
  const { id } = await params;
  return <ProjectDetail id={id} />;
}
