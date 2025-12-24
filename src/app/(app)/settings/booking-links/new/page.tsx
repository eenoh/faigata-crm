import type { Metadata } from "next";
import CreateSchedulePageClient from "../../../../../modules/crm/components/CreateSchedulePageClient";

export const metadata: Metadata = {
  title: "Create Schedule Page",
  description:
    "Create a new schedule page in FaigataCRM. Choose the meeting type, set a custom URL, and pick a primary color to generate gradients for your public booking link.",
};

export default function NewSchedulePage() {
  return <CreateSchedulePageClient />;
}
