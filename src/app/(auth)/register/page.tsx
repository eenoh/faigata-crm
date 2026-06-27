import type { Metadata } from "next";
import { RegisterPageClient } from "../../../components/RegisterPageClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RegisterPage");

  return {
    title: t("metadata.title"),
  };
}

export default function RegisterPage() {
  return <RegisterPageClient />;
}
