import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ProductFormClient from "@/features/billing/components/ProductFormClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingProductFormPage.metadata.create");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function NewProductPage() {
  return <ProductFormClient mode="create" />;
}
