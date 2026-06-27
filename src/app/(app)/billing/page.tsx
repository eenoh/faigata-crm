import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import BillingClient from "@/features/billing/components/BillingClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function BillingPage() {
  return <BillingClient />;
}
