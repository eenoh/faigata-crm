"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "@/components/providers/ThemeProvider";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type HomePageClientProps = {
  title: string;
  description: string;
  primaryCta: string;
};

const featureCards = [
  {
    eyebrow: "CRM",
    title: "Track every lead without losing context",
    body:
      "Keep setters, closers, and managers aligned with pipeline stages, activity history, notes, messages, and ownership in one workspace.",
  },
  {
    eyebrow: "Booking",
    title: "Turn handoffs into booked calls",
    body:
      "Public booking pages connect scheduling back to the lead record so your team can move from outreach to consultation without jumping between tools.",
  },
  {
    eyebrow: "Billing",
    title: "Close the loop with payments and invoices",
    body:
      "Products, invoices, customers, and payment activity live beside the CRM so the commercial outcome is visible after the sales conversation ends.",
  },
] as const;

const workflowSteps = [
  "Capture and qualify inbound or outbound leads.",
  "Book consultations through branded scheduling pages.",
  "Manage pipeline movement, ownership, and follow-up.",
  "Send invoices and track payments from the same product.",
] as const;

const proofPoints = [
  "Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4",
  "Supabase-backed auth and multi-tenant workspace flows",
  "Stripe products, invoices, payments, and connect integrations",
  "Localization support for international CRM and billing surfaces",
] as const;

export default function HomePageClient({
  title,
  description,
  primaryCta,
}: HomePageClientProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";
  const themeLabel = mounted ? (isDark ? "Dark mode" : "Light mode") : "Theme";

  const shellClass = cn(
    "min-h-screen",
    isDark
      ? "bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_35%),linear-gradient(180deg,#08111f_0%,#0b1220_50%,#09101d_100%)] text-slate-100"
      : "bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.14),transparent_35%),linear-gradient(180deg,#eef4ff_0%,#f8fafc_38%,#ecfeff_100%)] text-slate-900",
  );

  const panelClass = cn(
    "rounded-[2rem] border backdrop-blur-xl shadow-2xl",
    isDark
      ? "border-slate-800/80 bg-slate-950/60"
      : "border-white/70 bg-white/75",
  );

  const mutedText = isDark ? "text-slate-300" : "text-slate-600";
  const subtleText = isDark ? "text-slate-400" : "text-slate-500";
  const sectionTitle = isDark ? "text-slate-100" : "text-slate-900";

  const stats = useMemo(
    () => [
      { label: "Core surfaces", value: "CRM + Booking + Billing" },
      { label: "Built for", value: "Service and coaching sales teams" },
      { label: "Outcome", value: "From first message to paid customer" },
    ],
    [],
  );

  return (
    <main className={shellClass}>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <div
          className={cn(
            "mb-6 flex items-center justify-between rounded-2xl border px-4 py-3 shadow-sm",
            isDark
              ? "border-slate-800/80 bg-slate-950/55"
              : "border-white/80 bg-white/80",
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold shadow-sm",
                isDark
                  ? "bg-indigo-500/20 text-indigo-100"
                  : "bg-indigo-600 text-white",
              )}
            >
              <Image
                src="/icons/icon-faigata.svg"
                alt="Faigata logo"
                width={26}
                height={26}
                className="h-6 w-6"
              />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-indigo-500 uppercase">
                Faigata
              </p>
              <p className={cn("text-xs", subtleText)}>
                Sales workspace for lead flow, scheduling, and revenue ops
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={cn(
                "hidden rounded-full border px-3 py-1 text-xs font-medium sm:inline-flex",
                isDark
                  ? "border-slate-700 bg-slate-900/70 text-slate-200"
                  : "border-slate-200 bg-white text-slate-700",
              )}
            >
              {themeLabel}
            </span>
            <ThemeToggle />
          </div>
        </div>

        <section className={cn(panelClass, "overflow-hidden px-6 py-8 sm:px-8 lg:px-10 lg:py-10")}>
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]",
                    isDark
                      ? "bg-indigo-500/15 text-indigo-200"
                      : "bg-indigo-50 text-indigo-700",
                  )}
                >
                  Product overview
                </span>
                <span className={cn("text-xs font-medium", subtleText)}>
                  One system for the parts of sales that usually live in separate tools
                </span>
              </div>

              <h1 className={cn("max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl", sectionTitle)}>
                {title}
              </h1>

              <p className={cn("mt-5 max-w-3xl text-base leading-7 sm:text-lg", mutedText)}>
                {description}
              </p>

              <p className={cn("mt-4 max-w-3xl text-sm leading-7 sm:text-base", subtleText)}>
                Faigata brings lead management, booking, and billing into a single workflow so a team can move from
                first contact to booked consult to paid client without losing history or switching context.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/crm"
                  className={cn(
                    "rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition",
                    isDark
                      ? "bg-indigo-500 text-white hover:bg-indigo-400"
                      : "bg-indigo-600 text-white hover:bg-indigo-700",
                  )}
                >
                  {primaryCta}
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    "rounded-xl border px-5 py-3 text-sm font-semibold transition",
                    isDark
                      ? "border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-900"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                  )}
                >
                  View login flow
                </Link>
                <Link
                  href="/register"
                  className={cn(
                    "rounded-xl border px-5 py-3 text-sm font-semibold transition",
                    isDark
                      ? "border-slate-700 text-slate-200 hover:bg-slate-900/70"
                      : "border-slate-200 text-slate-700 hover:bg-white/85",
                  )}
                >
                  Create account
                </Link>
              </div>
            </div>

            <div
              className={cn(
                "rounded-[1.75rem] border p-5 shadow-xl",
                isDark
                  ? "border-slate-800 bg-slate-950/75"
                  : "border-slate-200 bg-white/90",
              )}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
                    Why it sells
                  </p>
                  <h2 className={cn("mt-2 text-xl font-semibold", sectionTitle)}>
                    A cleaner story than separate point tools
                  </h2>
                </div>
              </div>

              <div className="space-y-3">
                {stats.map((item) => (
                  <div
                    key={item.label}
                    className={cn(
                      "rounded-2xl border p-4",
                      isDark
                        ? "border-slate-800 bg-slate-900/70"
                        : "border-slate-200 bg-slate-50/90",
                    )}
                  >
                    <p className={cn("text-xs font-semibold uppercase tracking-[0.2em]", subtleText)}>
                      {item.label}
                    </p>
                    <p className={cn("mt-2 text-sm font-medium leading-6", sectionTitle)}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          {featureCards.map((card) => (
            <article key={card.title} className={cn(panelClass, "p-6")}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-500">
                {card.eyebrow}
              </p>
              <h2 className={cn("mt-4 text-2xl font-semibold tracking-tight", sectionTitle)}>
                {card.title}
              </h2>
              <p className={cn("mt-4 text-sm leading-7", mutedText)}>{card.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className={cn(panelClass, "p-6")}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-500">
              Workflow
            </p>
            <h2 className={cn("mt-4 text-2xl font-semibold tracking-tight", sectionTitle)}>
              The end-to-end sales motion this product is built around
            </h2>
            <div className="mt-6 space-y-4">
              {workflowSteps.map((step, index) => (
                <div key={step} className="flex gap-4">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      isDark
                        ? "bg-indigo-500/15 text-indigo-200"
                        : "bg-indigo-50 text-indigo-700",
                    )}
                  >
                    {index + 1}
                  </div>
                  <p className={cn("pt-1 text-sm leading-7", mutedText)}>{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={cn(panelClass, "p-6")}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-500">
              Technical proof
            </p>
            <h2 className={cn("mt-4 text-2xl font-semibold tracking-tight", sectionTitle)}>
              Built like a real product, not a landing-page-only demo
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {proofPoints.map((point) => (
                <div
                  key={point}
                  className={cn(
                    "rounded-2xl border p-4 text-sm leading-7",
                    isDark
                      ? "border-slate-800 bg-slate-900/60 text-slate-200"
                      : "border-slate-200 bg-white/90 text-slate-700",
                  )}
                >
                  {point}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
