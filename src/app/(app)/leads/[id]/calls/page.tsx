import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CallsListClient from "@/features/crm/components/CallsListClient";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CallsListPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LeadCallsPage({ params }: Props) {
  const resolved = await Promise.resolve(params);
  const leadId = decodeURIComponent(String(resolved?.id ?? "")).trim();

  return <CallsListClient leadId={leadId} />;
}
