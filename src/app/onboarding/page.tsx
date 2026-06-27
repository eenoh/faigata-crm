import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OnboardingPageClient } from "@/features/crm/components/OnboardingPageClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OnboardingPage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function OnboardingPage() {
  return <OnboardingPageClient />;
}
