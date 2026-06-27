import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ProductArchiveClient from "@/features/billing/components/ProductArchiveClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingProductArchivePage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function ArchiveProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <ProductArchiveClient productId={productId} />;
}
