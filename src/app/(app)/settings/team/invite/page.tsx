// src/app/(app)/settings/team/invite/page.tsx
import type { Metadata } from "next";
import { InviteTeamMemberClient } from "../../../../../modules/crm/components/InviteTeamMemberClient";

export const metadata: Metadata = {
  title: "Invite Team Members",
};

export default function InviteTeamPage() {
  return <InviteTeamMemberClient />;
}
