"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import {
  DocumentTextIcon,
  CubeIcon,
  CreditCardIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type BillingCard = {
  title: string;
  description: string;
  hint: string;
  href: string;
  icon: IconType;
  gradient: string;
};

const BILLING_CARDS: BillingCard[] = [
  {
    title: "Invoices",
    description:
      "Create, send, and track invoices for one-time or recurring charges.",
    hint: "Paid • Open • Overdue • Draft",
    href: "/billing/invoices",
    icon: DocumentTextIcon,
    gradient: "from-indigo-500 to-violet-500",
  },
  {
    title: "Products",
    description:
      "Define products and prices used for invoices and subscriptions.",
    hint: "One-time • Recurring",
    href: "/billing/products",
    icon: CubeIcon,
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    title: "Payments",
    description:
      "Monitor incoming payments and failed or pending transactions.",
    hint: "Succeeded • Pending • Failed",
    href: "/billing/payments",
    icon: CreditCardIcon,
    gradient: "from-sky-500 to-blue-500",
  },
  {
    title: "Customers",
    description: "Manage Stripe customers linked to leads and organizations.",
    hint: "Billing details • Payment methods",
    href: "/billing/customers",
    icon: UsersIcon,
    gradient: "from-amber-500 to-orange-500",
  },
];

export default function BillingClient() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

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

  return (
    <div className="max-w-6xl space-y-8">
      {/* Header */}
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${cardBase}`}>
        <h1 className={`text-2xl font-semibold ${headerText}`}>
          Billing & Payments
        </h1>
        <p className={`mt-1 max-w-3xl text-sm ${bodyText}`}>
          Manage your Stripe-powered billing — products, invoices, customers,
          and payment activity — all in one place.
        </p>
      </div>

      {/* Cards */}
      <div className="grid gap-5 sm:grid-cols-2">
        {BILLING_CARDS.map(
          ({ title, description, hint, href, icon: Icon, gradient }) => (
            <Link
              key={title}
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
                Open {title} →
              </div>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
