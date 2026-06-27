import type { Metadata } from "next";
import AcceptInviteClient from "@/features/crm/components/AcceptInviteClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AcceptInvitePage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function Page() {
  return <AcceptInviteClient />;
}
