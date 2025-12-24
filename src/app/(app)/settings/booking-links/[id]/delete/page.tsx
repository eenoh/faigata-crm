import type { Metadata } from "next";
import DeleteSchedulePageClient from "./DeleteSchedulePageClient";

export const metadata: Metadata = {
  title: "Delete Schedule Page",
  description:
    "Confirm deletion of this schedule page. This will hide the schedule page while keeping existing bookings.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DeleteSchedulePageClient />;
}
