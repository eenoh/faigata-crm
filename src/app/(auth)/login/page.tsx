import type { Metadata } from "next";
import { LoginPageClient } from "../../../components/LoginPageClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LoginPage");

  return {
    title: t("metadata.title"),
  };
}

export default function LoginPage() {
  return <LoginPageClient />;
}
