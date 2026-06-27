import type { Metadata } from "next";
import ProductSuitePageClient from "../../components/ProductSuitePageClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ProductSuite");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function ProductSuitePage() {
  return <ProductSuitePageClient />;
}
