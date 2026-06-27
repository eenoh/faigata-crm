import type { Metadata } from "next";
import IntegrationsClient from "../../../components/IntegrationsClient";
import ProductSuiteShellClient from "@/components/layout/ProductSuiteShellClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Integrations");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function IntegrationsPage() {
  return (
    <ProductSuiteShellClient>
      <IntegrationsClient />
    </ProductSuiteShellClient>
  );
}
