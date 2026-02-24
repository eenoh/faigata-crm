"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
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
  return (
    <div className="max-w-6xl space-y-8">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white px-7 py-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          Billing & Payments
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
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
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div
                className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}
              >
                <Icon className="h-5 w-5" />
              </div>

              <h2 className="text-base font-semibold text-slate-900">
                {title}
              </h2>

              <p className="mt-1 text-sm text-slate-600">{description}</p>

              <p className="mt-3 text-xs font-medium text-slate-400">{hint}</p>

              <div className="mt-4 text-sm font-semibold text-indigo-600">
                Open {title} →
              </div>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
