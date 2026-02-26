"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

const THEME_COOKIE = "faigata_theme";
const STORAGE_KEY = "faigata-theme"; // ✅ consistent key
const ONE_YEAR = 60 * 60 * 24 * 365;

function ThemeCookieSync() {
  const { theme, resolvedTheme } = useTheme();

  React.useEffect(() => {
    // theme can be "system" (if enabled) or undefined while hydrating.
    // We want to persist an actual "light" | "dark" value into the cookie.
    const value =
      theme === "light" || theme === "dark"
        ? theme
        : resolvedTheme === "light" || resolvedTheme === "dark"
          ? resolvedTheme
          : null;

    if (!value) return;

    document.cookie = `${THEME_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
  }, [theme, resolvedTheme]);

  return null;
}

export default function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: React.ReactNode;
  defaultTheme?: "light" | "dark";
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem={false} // keep your current behavior
      themes={["light", "dark"]}
      disableTransitionOnChange
      storageKey={STORAGE_KEY} // ✅ IMPORTANT
    >
      <ThemeCookieSync />
      {children}
    </NextThemesProvider>
  );
}
