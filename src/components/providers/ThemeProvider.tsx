"use client";

import * as React from "react";
import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
} from "next-themes";

type Theme = "light" | "dark";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
};

const THEME_COOKIE = "faigata_theme";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const ThemeDefaultsContext = React.createContext<Theme>("light");

function normalizeTheme(value: string | undefined, fallback: Theme): Theme {
  return value === "dark" ? "dark" : value === "light" ? "light" : fallback;
}

function ThemeCookieSync() {
  const { theme, resolvedTheme } = useTheme();

  React.useEffect(() => {
    const value =
      theme === "light" || theme === "dark"
        ? theme
        : resolvedTheme === "light" || resolvedTheme === "dark"
          ? resolvedTheme
          : null;

    if (!value) {
      return;
    }

    document.documentElement.style.colorScheme = value;
    document.cookie = [
      `${THEME_COOKIE}=${encodeURIComponent(value)}`,
      "Path=/",
      `Max-Age=${ONE_YEAR_IN_SECONDS}`,
      "SameSite=Lax",
    ].join("; ");
  }, [theme, resolvedTheme]);

  return null;
}

export default function ThemeProvider({
  children,
  defaultTheme = "light",
}: ThemeProviderProps) {
  return (
    <ThemeDefaultsContext.Provider value={defaultTheme}>
      <NextThemesProvider
        attribute="class"
        defaultTheme={defaultTheme}
        disableTransitionOnChange
        enableSystem={false}
        storageKey={THEME_COOKIE}
        themes={["light", "dark"]}
      >
        <ThemeCookieSync />
        {children}
      </NextThemesProvider>
    </ThemeDefaultsContext.Provider>
  );
}

export function useTheme() {
  const initialTheme = React.useContext(ThemeDefaultsContext);
  const themeState = useNextTheme();

  return {
    ...themeState,
    theme: normalizeTheme(themeState.theme, initialTheme),
    resolvedTheme: normalizeTheme(
      themeState.resolvedTheme ?? themeState.theme,
      initialTheme,
    ),
  };
}
