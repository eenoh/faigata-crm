import type { Metadata } from "next";
import CalendarSettingsClient from "../../../../modules/crm/components/CalendarSettingsClient";

export const metadata: Metadata = {
  title: "Add Integrations",
  description:
    "Connect your Google Calendar or Microsoft Outlook Calendar and email to sync meetings and communication with FaigataCRM.",
};

export default function CalendarSettingsPage() {
  return <CalendarSettingsClient />;
}
