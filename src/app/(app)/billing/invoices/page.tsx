import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import BillingInvoicesClient from "@/features/billing/components/BillingInvoicesClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingInvoicesPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function BillingInvoicesPage() {
  return <BillingInvoicesClient />;
}
