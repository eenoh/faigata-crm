# Agent Context For Faigata

This file gives future contributors a fast orientation before they touch the codebase.

## Simplicity First

When working in this repository, default to the simplest viable solution.

- Always look for the lowest-maintenance approach first.
- Prefer clear, boring code over clever abstractions.
- Prefer standard Next.js, React, Supabase, and Stripe patterns over custom frameworks.
- Prefer small, incremental changes over broad rewrites.
- Keep local development easy to run and debug.
- Keep future Vercel deployment straightforward.
- If a change introduces meaningful complexity, document the tradeoff and why the simpler option was not enough.
- When multiple solutions work, choose the one with the lowest maintenance burden unless there is a strong product or operational reason not to.

## Product Summary

Faigata is a team-based SaaS product that combines:

- CRM workflows for leads, messaging, scoring, and reporting
- Booking workflows for schedule pages, public booking links, and outcomes
- Billing workflows backed by Stripe products, invoices, payments, and customer records

## Current Architecture

- `src/app`: App Router pages, layouts, and thin API entrypoints
- `src/components`: shared UI and product-shell building blocks
- `src/context`: workspace and sidebar state providers
- `src/features`: domain-owned code grouped by feature
- `src/hooks`: reusable React hooks
- `src/lib`: shared infrastructure for env, Supabase, Stripe, auth, validation, HTTP, and Postgres
- `src/styles`: global design tokens

Key platform layers:

- `src/lib/env/*`: runtime environment validation helpers
- `src/lib/supabase/*`: browser, server, and admin Supabase clients
- `src/lib/stripe/*`: server-only Stripe clients and webhook helpers
- `src/lib/auth/session.ts`: request token parsing + Supabase user resolution
- `src/features/auth/server/*`: registration flows
- `src/features/integrations/stripe/server/*`: Stripe Connect onboarding + connected-account webhooks
- `src/features/billing/server/*`: billing auth helpers + platform webhook handling
- `src/features/organizations/server/*`: organization resolution and Stripe account lookup

## Working Rules

- Read `PRODUCT_REQUIREMENTS.md`, `ARCHITECTURE.md`, and `BUILD_PLAN.md` before making structural changes.
- Keep `page.tsx`, `layout.tsx`, and `route.ts` thin.
- Put new business logic in `src/features/...` or `src/lib/...`.
- Use the dedicated Supabase modules instead of creating ad-hoc clients.
- Use the dedicated Stripe modules instead of instantiating Stripe in route files.
- Prefer Server Components unless a component needs browser APIs or interaction.
- Prefer consistency with the existing stack over introducing new libraries or patterns.
- Avoid unnecessary abstractions, indirection, and speculative generalization.
- Choose solutions that are easy for a new engineer to understand in one reading.
- Favor solutions that work cleanly both locally and on Vercel Node runtimes.
- Reuse shared helpers before adding more logic to the large CRM clients.

## High-Complexity Files

These files still deserve extra care because of size and coupling:

- `src/features/crm/components/LeadDetailClient.tsx`
- `src/features/crm/components/DashboardClient.tsx`
- `src/features/crm/components/CreateSchedulePageClient.tsx`
- `src/features/crm/components/NewLeadClient.tsx`
- `src/features/crm/components/LeadsClient.tsx`

Safe strategy for those areas:

1. Extract pure helpers first.
2. Extract presentational subcomponents second.
3. Move data orchestration into hooks only when it actually improves readability.
4. Avoid visual churn unless the task explicitly asks for UI changes.
5. Do not add new abstraction layers unless they clearly reduce complexity.

## Quality Workflow

Before finishing a change:

- run `npm run typecheck`
- run `npm run lint`
- run `npm run test:unit`
- run `npm run build`
- update `documentation.md` plus the root planning docs if the architecture or workflows changed

## Repo Notes

- `package-lock.json` may need regeneration whenever dependencies change.
- The new architectural baseline is `src/features` + `src/lib`; avoid reintroducing `src/modules`.
- New CI lives in `.github/workflows/ci.yml`.
- The target quality bar is high, but the preferred path is still pragmatic simplicity rather than overengineering.
