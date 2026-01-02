import type { Metadata } from "next";
import IntegrationsClient from "@/components/IntegrationsClient";
import ProductSuiteShellClient from "@/components/layout/ProductSuiteShellClient";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Connect Google Calendar or Microsoft Outlook to sync meetings and keep your workspace in sync.",
};

export default function IntegrationsPage() {
  return (
    <ProductSuiteShellClient>
      <IntegrationsClient />
    </ProductSuiteShellClient>
  );
}
