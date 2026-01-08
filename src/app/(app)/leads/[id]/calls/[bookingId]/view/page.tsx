// src/app/(app)/leads/[id]/calls/[bookingId]/view/page.tsx
import type { Metadata } from "next";
import CallDetailClient from "@/modules/crm/components/CallDetailClient";

type PageParams = { id: string; bookingId: string };

// ✅ Next can pass params as Promise
type PageProps = { params: Promise<PageParams> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Call Details",
    description: `Call details for lead ${id}`,
  };
}

export default async function CallDetailPage({ params }: PageProps) {
  const { id, bookingId } = await params;

  return (
    <div className="p-6">
      <CallDetailClient leadId={id} bookingId={bookingId} />
    </div>
  );
}
