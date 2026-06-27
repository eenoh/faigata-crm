"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSidebar } from "@/context/SidebarContext";
import {
  ChevronLeftIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/components/providers/ThemeProvider";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type NavItem = {
  href: string;
  label: string;
  iconSrc: string;
};

export function ProductSuiteSidebar() {
  const t = useTranslations("ProductSuiteSidebar");
  const common = useTranslations("Common");
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();
  const [loggingOut, setLoggingOut] = useState(false);

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const navItems: NavItem[] = useMemo(
    () => [
      {
        href: "/crm",
        label: t("nav.crm"),
        iconSrc: "/icons/icon-crm.svg",
      },
    ],
    [t],
  );

  const widthClass = collapsed ? "w-16" : "w-64";
  const brandRevealClass = collapsed ? "w-0 opacity-0" : "w-36 opacity-100";
  const brandSlideClass = collapsed ? "-translate-x-3" : "translate-x-0";
  const logoutRevealClass = collapsed
    ? "w-0 opacity-0"
    : "w-[60px] opacity-100";

  const isActive = useMemo(
    () => (href: string) =>
      pathname === href || pathname.startsWith(href + "/"),
    [pathname],
  );

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[ProductSuiteSidebar] logout failed", err);
    } finally {
      router.replace("/login");
      setLoggingOut(false);
    }
  }

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r shadow-sm transition-all duration-300 ease-in-out",
        widthClass,
        isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white",
      )}
    >
      {/* Brand row */}
      <div className="flex items-center px-3 pt-4 pb-6">
        <Link href="/crm" className="flex items-center gap-2">
          <Image
            src="/icons/icon-faigata.svg"
            alt={common("brand.logoAlt")}
            width={36}
            height={36}
            className={cn(
              "rounded-lg shadow-sm",
              isDark ? "ring-1 ring-white/10" : "ring-0",
            )}
            priority
          />

          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              brandRevealClass,
            )}
          >
            <span
              className={cn(
                "block truncate text-lg font-semibold transform transition-transform duration-300",
                brandSlideClass,
                isDark ? "text-slate-100" : "text-slate-900",
              )}
            >
              Faigata
            </span>
          </div>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? isDark
                    ? "bg-indigo-950/40 text-indigo-200 border border-indigo-500/20"
                    : "bg-indigo-50 text-indigo-600"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-900 hover:text-slate-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Image
                src={item.iconSrc}
                alt={item.label}
                width={20}
                height={20}
                className={cn(
                  "flex-shrink-0",
                  isDark ? "opacity-90" : "opacity-100",
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Logout button */}
      <div
        className={cn(
          "px-2 pb-3 pt-2 border-t",
          isDark ? "border-slate-800" : "border-slate-100",
        )}
      >
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? t("logout") : undefined}
          className={cn(
            "flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer",
            isDark
              ? "text-slate-400 hover:bg-rose-950/30 hover:text-rose-300"
              : "text-slate-500 hover:bg-rose-50 hover:text-rose-600",
          )}
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4 flex-shrink-0" />

          <div
            className={cn(
              "ml-1 overflow-hidden transition-[width,opacity] duration-300",
              logoutRevealClass,
            )}
          >
            <span className="whitespace-nowrap">
              {loggingOut ? t("loggingOut") : t("logout")}
            </span>
          </div>
        </button>
      </div>

      {/* Collapse/Expand Button */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
        className={cn(
          "group absolute right-[-18px] top-1/2 -translate-y-1/2 z-40 flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-colors cursor-pointer",
          isDark
            ? "border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900"
            : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50",
        )}
      >
        <ChevronLeftIcon
          className={cn(
            "h-4 w-4 transition-transform duration-200",
            isDark ? "text-slate-300" : "text-slate-500",
            collapsed ? "rotate-180" : "",
          )}
        />
      </button>
    </aside>
  );
}
