import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/providers/ThemeProvider";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import {
  getHtmlTextDirection,
  normalizeLocale,
  type AppLocale,
} from "@/i18n/config";
import { LocaleProvider } from "@/context/LocaleContext";

export const metadata: Metadata = {
  title: "Faigata",
  description:
    "Faigata is a full-stack CRM, booking, and billing workspace built with Next.js, Supabase, Stripe, and TypeScript.",
};

const THEME_COOKIE = "faigata_theme";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, localeFromServer, messages] = await Promise.all([
    cookies(),
    getLocale(),
    getMessages(),
  ]);

  const cookieTheme = cookieStore.get(THEME_COOKIE)?.value;
  const initialTheme: "light" | "dark" =
    cookieTheme === "dark" ? "dark" : "light";

  const locale = (normalizeLocale(localeFromServer) ?? "en") as AppLocale;

  return (
    <html
      lang={locale}
      dir={getHtmlTextDirection(locale)}
      suppressHydrationWarning
      className={initialTheme === "dark" ? "dark" : ""}
    >
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <ThemeProvider defaultTheme={initialTheme}>
          <NextIntlClientProvider
            key={locale}
            locale={locale}
            messages={messages}
          >
            <LocaleProvider initialLocale={locale}>
              {children}
            </LocaleProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
