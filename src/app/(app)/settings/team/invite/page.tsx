import type { Metadata } from "next";
import { InviteTeamMemberClient } from "@/features/crm/components/InviteTeamMemberClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("InviteTeamMembersPage");

  return {
    title: t("metadata.title"),
  };
}

export default function InviteTeamPage() {
  return <InviteTeamMemberClient />;
}
