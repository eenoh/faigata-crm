import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import BillingProductsClient from "@/features/billing/components/BillingProductsClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingProductsPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function BillingProductsPage() {
  return <BillingProductsClient />;
}
