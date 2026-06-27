import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import InvoiceDetailClient from "@/features/billing/components/InvoiceDetailClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingInvoiceDetailPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

// ✅ Next typegen expects params to be Promise-like in this setup.
type PageProps = {
  params: Promise<{ invoiceId: string }>;
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params);
  const invoiceId = decodeURIComponent(
    String(resolved?.invoiceId ?? ""),
  ).trim();

  return <InvoiceDetailClient invoiceId={invoiceId} />;
}
