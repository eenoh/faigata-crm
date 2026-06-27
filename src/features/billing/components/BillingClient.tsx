"use client";

import Link from "next/link";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import { useTranslations } from "next-intl";
import {
  DocumentTextIcon,
  CubeIcon,
  CreditCardIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type BillingCard = {
  key: "invoices" | "products" | "payments" | "customers";
  href: string;
  icon: IconType;
  gradient: string;
};

const BILLING_CARDS: BillingCard[] = [
  {
    key: "invoices",
    href: "/billing/invoices",
    icon: DocumentTextIcon,
    gradient: "from-indigo-500 to-violet-500",
  },
  {
    key: "products",
    href: "/billing/products",
    icon: CubeIcon,
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    key: "payments",
    href: "/billing/payments",
    icon: CreditCardIcon,
    gradient: "from-sky-500 to-blue-500",
  },
  {
    key: "customers",
    href: "/billing/customers",
    icon: UsersIcon,
    gradient: "from-amber-500 to-orange-500",
  },
];

export default function BillingClient() {
  const t = useTranslations("BillingPage");
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const cardBase = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const cardHover = isDark ? "hover:bg-slate-900/40" : "hover:bg-white";

  const headerText = isDark ? "text-slate-100" : "text-slate-900";
  const bodyText = isDark ? "text-slate-400" : "text-slate-600";
  const hintText = isDark ? "text-slate-500" : "text-slate-400";
  const linkText = isDark
    ? "text-indigo-300 group-hover:text-indigo-200"
    : "text-indigo-600 group-hover:text-indigo-700";

  const cards = useMemo(
    () =>
      BILLING_CARDS.map((card) => ({
        ...card,
        title: t(`cards.${card.key}.title`),
        description: t(`cards.${card.key}.description`),
        hint: t(`cards.${card.key}.hint`),
      })),
    [t],
  );

  return (
    <div className="max-w-6xl space-y-8">
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${cardBase}`}>
        <h1 className={`text-2xl font-semibold ${headerText}`}>
          {t("page.title")}
        </h1>
        <p className={`mt-1 max-w-3xl text-sm ${bodyText}`}>
          {t("page.description")}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {cards.map(
          ({ key, title, description, hint, href, icon: Icon, gradient }) => (
            <Link
              key={key}
              href={href}
              className={`group rounded-2xl border p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${cardBase} ${cardHover}`}
            >
              <div
                className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}
              >
                <Icon className="h-5 w-5" />
              </div>

              <h2 className={`text-base font-semibold ${headerText}`}>
                {title}
              </h2>

              <p className={`mt-1 text-sm ${bodyText}`}>{description}</p>

              <p className={`mt-3 text-xs font-medium ${hintText}`}>{hint}</p>

              <div
                className={`mt-4 text-sm font-semibold transition-colors ${linkText}`}
              >
                {t("actions.openCard", { title })} →
              </div>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
