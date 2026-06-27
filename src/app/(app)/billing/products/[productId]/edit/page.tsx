import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ProductFormClient from "@/features/billing/components/ProductFormClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingProductFormPage.metadata.edit");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const resolved = await Promise.resolve(params);
  const productId = String(resolved?.productId ?? "").trim();

  return <ProductFormClient mode="edit" productId={productId} />;
}
