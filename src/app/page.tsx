import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import HomePageClient from "@/components/HomePageClient";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/crm");
  }

  const t = await getTranslations("Home");

  return (
    <HomePageClient
      title={t("title")}
      description={t("description")}
      primaryCta={t("cta")}
    />
  );
}
