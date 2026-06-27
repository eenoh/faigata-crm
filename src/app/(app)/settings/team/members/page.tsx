import type { Metadata } from "next";
import { ManageTeamRolesClient } from "@/features/crm/components/ManageTeamRolesClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ManageTeamRolesPage");

  return {
    title: t("metadata.title"),
  };
}

export default function TeamMembersPage() {
  return <ManageTeamRolesClient />;
}
