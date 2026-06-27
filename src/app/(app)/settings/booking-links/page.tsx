import type { Metadata } from "next";
import SettingsBookingLinksClient from "@/features/crm/components/SettingsBookingLinksClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BookingLinksPage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function BookingLinksPage() {
  return <SettingsBookingLinksClient />;
}
