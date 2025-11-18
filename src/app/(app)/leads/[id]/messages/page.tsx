// src/app/(app)/leads/[id]/messages/page.tsx
import type { Metadata } from "next";
import { LeadMessagesClient } from "./LeadMessagesClient";

export const metadata: Metadata = {
  title: "Log Lead Messages",
  description:
    "Track outbound and inbound conversations with a specific lead.",
};

export default function LeadMessagesPage() {
  return <LeadMessagesClient />;
}
