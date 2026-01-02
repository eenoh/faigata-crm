"use client";

import Link from "next/link";
import {
  DocumentTextIcon,
  CubeIcon,
  CreditCardIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

type BillingCard = {
  title: string;
  description: string;
  hint: string;
  href: string;
  icon: any;
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
    description:
      "Manage Stripe customers linked to leads and organizations.",
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
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-7 py-6 shadow-sm">
        <div className="relative">
          <h1 className="text-2xl font-semibold text-slate-900">
            Billing & Payments
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Manage your Stripe-powered billing — products, invoices, customers,
            and payment activity — all in one place.
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-5 sm:grid-cols-2">
        {BILLING_CARDS.map((card) => {
          const Icon = card.icon;

          return (
            <Link
              key={card.title}
              href={card.href}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="relative flex h-full flex-col">
                {/* Icon */}
                <div
                  className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-sm`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                {/* Content */}
                <h2 className="text-base font-semibold text-slate-900">
                  {card.title}
                </h2>

                <p className="mt-1 flex-1 text-sm text-slate-600">
                  {card.description}
                </p>

                {/* Hint */}
                <p className="mt-3 text-xs font-medium text-slate-400">
                  {card.hint}
                </p>

                {/* CTA */}
                <div className="mt-4 text-sm font-semibold text-indigo-600">
                  Open {card.title} →
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
