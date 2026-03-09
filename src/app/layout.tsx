// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/providers/ThemeProvider";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Faigata",
  description: "Faigata CRM",
};

const THEME_COOKIE = "faigata_theme";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get(THEME_COOKIE)?.value;

  const initialTheme: "light" | "dark" =
    cookieTheme === "dark" ? "dark" : "light";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={initialTheme === "dark" ? "dark" : ""}
    >
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <ThemeProvider defaultTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
