import type { Metadata } from "next";
import { ManageTeamRolesClient } from "./ManageTeamRolesClient";

export const metadata: Metadata = {
  title: "Manage Team Roles",
};

export default function TeamMembersPage() {
  return <ManageTeamRolesClient />;
}
