# Faigata

Faigata is a full-stack CRM, booking, and billing application for service-based sales teams. It brings lead management, scheduling, and Stripe-backed billing into one Next.js product so a team can move from first contact to booked call to paid customer without juggling separate tools.

## Project Highlights

- Built as a multi-tenant product with authenticated workspaces, role-aware CRM flows, and public booking pages.
- Uses a real full-stack architecture: Next.js App Router, Supabase auth/data access, Stripe billing, and server-side route handlers.
- Includes localization infrastructure, automated translation support, and a responsive dashboard experience.
- Now passes `typecheck`, `lint`, `build`, and the unit test suite, making it safer to demo and easier to maintain.

## Problem It Solves

Small sales or coaching teams often need three connected workflows:

1. Capture and manage leads.
2. Book calls without losing context.
3. Track offers, customers, invoices, and payments.

Faigata combines those workflows in a single app so the handoff between CRM, booking, and billing is visible and measurable.

## Main Features

- Lead pipeline management with stage tracking, scoring, messages, and activity history
- Dashboard views for recent activity, funnel progression, and basic conversion visibility
- Public booking links tied back to CRM lead records
- Team, invite, and role-aware workspace flows
- Billing workspace for Stripe products, customers, invoices, and payments
- Locale-aware UI with translation helpers for CRM and billing display content

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase
- Stripe + Stripe Connect
- Vitest
- Playwright

## Screenshots

Add screenshots here before publishing the project:

- Dashboard overview
- Lead detail page
- Pipeline view
- Booking link page
- Billing products or invoices page

## Local Setup

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local`
3. Fill in the required environment variables
4. Start the app:
   `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

Useful quality commands:

- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run build`
- `npm run check`

## Environment Variables

Minimum required variables for local development:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Feature-specific variables:

- `DATABASE_URL`
  Used only for legacy compatibility paths that still expect direct Postgres access.
- `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY`, `LIBRETRANSLATE_TIMEOUT_MS`
  Optional. Enables automatic translation support.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_OAUTH_STATE_SECRET`
  Required for Google Calendar integration.
- `STRIPE_*`
  Required for billing, Stripe Connect, and webhook flows.

See [.env.example](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/.env.example) for the full list.

## Authentication And Demo Account

There is no shared public demo account in the repository.

Recommended demo setup:

1. Create a local Supabase project.
2. Register a fresh owner/admin account through the app.
3. Complete onboarding.
4. Seed or create a few leads, at least one booking link, and one billing product before recording screenshots or giving a live demo.

If you want a polished interview demo, show the app with:

- one team
- several leads across different stages
- at least one translated or enriched lead/message example
- one booking flow
- one or two Stripe-backed products or invoices

## Clear Demo Path

For a recruiter or hiring manager, this is the strongest path through the app:

1. Start on the homepage and explain the product scope: CRM + booking + billing.
2. Log in and show the dashboard summary.
3. Open the leads list, then drill into a lead detail page with messages and activity history.
4. Show the pipeline or settings area to demonstrate configurable business logic.
5. Finish with booking links or the billing workspace to show that the project goes beyond CRUD screens.

## Architecture Summary

- `src/app`
  App Router pages, layouts, and API route entrypoints
- `src/features`
  Domain-specific server and UI logic for CRM, billing, auth, organizations, and integrations
- `src/components`
  Reusable cross-feature UI
- `src/lib`
  Shared environment, auth, Supabase, Stripe, HTTP, and validation helpers
- `tests`
  Unit and end-to-end test coverage

More implementation detail lives in [documentation.md](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/documentation.md) and [ARCHITECTURE.md](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/ARCHITECTURE.md).

## What I Learned / Technical Challenges

- Designing feature boundaries inside a growing App Router codebase without rebuilding the whole project
- Standardizing auth and server-side request handling across many API routes
- Balancing product UX with infrastructure concerns like Stripe, Supabase, and localization
- Keeping a real product demo-friendly by tightening unfinished edges instead of endlessly adding features

## Future Improvements

- Add a lightweight seed script for interview-ready demo data
- Expand end-to-end coverage for the highest-value authenticated flows
- Continue migrating older route logic into thinner route wrappers and shared server handlers
- Improve image handling by replacing remaining `<img>` usage with optimized `next/image` where appropriate

## TODO / Manual Review

- Playwright end-to-end tests were not run as part of this cleanup pass because they require a fully configured local runtime and browser environment.
- Billing and Google integration flows should be smoke-tested manually with real credentials before a recorded demo.
