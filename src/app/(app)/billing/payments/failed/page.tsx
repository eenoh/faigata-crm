import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import FailedPaymentsClient from "@/features/billing/components/FailedPaymentsClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingFailedPaymentsPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function FailedPaymentsPage() {
  return <FailedPaymentsClient />;
}
