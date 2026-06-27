import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PaymentsClient from "@/features/billing/components/PaymentsClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingPaymentsPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function PaymentsPage() {
  return <PaymentsClient />;
}
