import type { Metadata } from "next";
import SettingsBookingLinksClient from "../../../../modules/crm/components/SettingsBookingLinksClient";

export const metadata: Metadata = {
  title: "Schedule Pages",
  description:
    "View and manage all of your FaigataCRM schedule pages in one place. Create booking links that let leads book time directly on your connected Google Calendar.",
};

export default function BookingLinksPage() {
  return <SettingsBookingLinksClient />;
}
