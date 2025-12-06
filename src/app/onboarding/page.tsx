// src/app/onboarding/page.tsx
import type { Metadata } from "next";
import { OnboardingPageClient } from "../../modules/crm/components/OnboardingPageClient";

export const metadata: Metadata = {
  title: "Onboarding",
};

export default function OnboardingPage() {
  return <OnboardingPageClient />;
}
