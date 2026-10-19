import type { Metadata } from "next";
import { CalendarPage } from "@/features/crm/calendar";

export const metadata: Metadata = { title: "Calendrier" };

export default function Page() {
  return <CalendarPage />;
}
