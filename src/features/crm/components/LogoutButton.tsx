"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTranslations } from "next-intl";

export function LogoutButton() {
  const router = useRouter();
  const t = useTranslations("SettingsPage.logout");

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[Settings] signOut error", err);
    } finally {
      router.replace("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="block rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition cursor-pointer"
    >
      {t("button")}
    </button>
  );
}
