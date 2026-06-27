import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PaymentDetailClient from "@/features/billing/components/PaymentDetailClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingPaymentDetailPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PaymentDetailPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params);
  const paymentIntentId = decodeURIComponent(String(resolved?.id ?? "")).trim();

  return <PaymentDetailClient paymentIntentId={paymentIntentId} />;
}
