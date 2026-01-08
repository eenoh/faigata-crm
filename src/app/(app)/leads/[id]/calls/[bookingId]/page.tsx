// src/app/(app)/leads/[id]/calls/[bookingId]/page.tsx
import type { Metadata } from "next";
import CallOutcomeClient from "@/modules/crm/components/CallOutcomeClient";

export const metadata: Metadata = {
  title: "Call Outcome",
  description: "Track attendance, offer made, and whether the lead closed on the call.",
};

// ✅ Next 15+ can pass params as a Promise in some dynamic routes
type PageProps = {
  params: Promise<{ id: string; bookingId: string }>;
};

export default async function CallOutcomePage({ params }: PageProps) {
  const { id, bookingId } = await params;

  return (
    <div className="p-6">
      <CallOutcomeClient leadId={id} bookingId={bookingId} />
    </div>
  );
}
