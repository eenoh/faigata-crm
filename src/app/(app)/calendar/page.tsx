import type { Metadata } from "next";
import CalendarClient from "../../../modules/crm/components/CalendarClient";

export const metadata: Metadata = {
  title: "Calendar",
  description: "View your Google Calendar availability inside FaigataCRM.",
};

export default function CalendarPage() {
  return <CalendarClient />;
}
