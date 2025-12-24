import type { Metadata } from "next";
import { DeleteTeamMemberClient } from "../../../../../../../modules/crm/components/DeleteTeamMemberClient";

export const metadata: Metadata = {
  title: "Remove team member",
  description:
    "Confirm removal of a team member from this workspace. This action cannot be undone.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DeleteTeamMemberPage() {
  return <DeleteTeamMemberClient />;
}
