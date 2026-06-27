import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations("Home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
      <h1 className="mb-4 text-3xl font-bold">{t("title")}</h1>
      <p className="mb-6 text-slate-600">{t("description")}</p>
      <Link
        href="/dashboard"
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white"
      >
        {t("cta")}
      </Link>
    </main>
  );
}
