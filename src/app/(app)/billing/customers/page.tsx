import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import BillingCustomersClient from "@/features/billing/components/BillingCustomersClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingCustomersPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function BillingCustomersPage() {
  return <BillingCustomersClient />;
}
