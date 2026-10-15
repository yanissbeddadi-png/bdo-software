import type { Metadata } from "next";
import { TasksPage } from "@/features/tasks/tasks";

export const metadata: Metadata = { title: "Tâches" };

export default function Page() {
  return <TasksPage />;
}
