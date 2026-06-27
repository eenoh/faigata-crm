import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ProductSuitePageClient from "../../components/ProductSuitePageClient";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ProductSuite");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default async function ProductSuitePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fcrm");
  }

  return <ProductSuitePageClient />;
}
