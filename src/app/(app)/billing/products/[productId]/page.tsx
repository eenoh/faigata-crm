import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ProductDetailClient from "@/features/billing/components/ProductDetailClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingProductDetailPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const resolved = await Promise.resolve(params);
  const productId = String(resolved?.productId ?? "").trim();

  return <ProductDetailClient productId={productId} />;
}
