import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ProfileSettingsClient from "@/components/ProfileSettingsClient";
import ProductSuiteShellClient from "@/components/layout/ProductSuiteShellClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ProfileSettings");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function ProfilePage() {
  return (
    <ProductSuiteShellClient>
      <ProfileSettingsClient />
    </ProductSuiteShellClient>
  );
}
