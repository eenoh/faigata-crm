import type { Metadata } from "next";
import { InviteTeamMemberClient } from "./InviteTeamMemberClient";

export const metadata: Metadata = {
  title: "Invite Team Members",
};

export default function InviteTeamPage() {
  return <InviteTeamMemberClient />;
}
