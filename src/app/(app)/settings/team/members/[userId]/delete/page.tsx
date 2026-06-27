import type { Metadata } from "next";
import { DeleteTeamMemberClient } from "@/features/crm/components/DeleteTeamMemberClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("DeleteTeamMemberPage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function DeleteTeamMemberPage() {
  return <DeleteTeamMemberClient />;
}
