# Faigata Product Requirements

## Title

Faigata: CRM, Booking, and Billing Workspace for High-Ticket Business Coaches

## Product Summary

Faigata is a multi-tenant web application that combines lead management, discovery-call booking, and Stripe-backed billing in one product. Based on the current codebase, the product is designed to help coaching businesses move a lead from capture to booked call to payment without switching between multiple tools.

## Current State

- The app is a single Next.js App Router codebase with roughly 45 pages and 68 API routes.
- The strongest implemented areas are CRM lead workflows, public booking links, team onboarding/invites, and Stripe product/invoice/payment management.
- Supabase is the primary backend for auth, database access, and storage.
- Stripe Connect and Stripe billing are already integrated.
- Google Calendar OAuth exists for booking availability and scheduling workflows.
- The current implementation is usable but still operationally uneven: some routes are thin and feature-based, while others still contain large inline orchestration.
- Assumption: the product is still pre-launch or early-stage because test coverage is shallow, onboarding is still evolving, and documentation/setup are incomplete.

## Problem Statement

High-ticket business coaches who sell through discovery calls need one simple system to:

- collect and organize leads,
- qualify and score them,
- book discovery calls,
- coordinate sales work across a small team,
- and take payment after a successful call.

Today, that workflow is often spread across a CRM, a calendar booking tool, spreadsheets, and a payment platform. The codebase suggests Faigata is intended to reduce that operational sprawl with one opinionated workspace.

## Target Users (High-Ticket Business Coaches Who Close Clients on Discovery Calls)

- Primary user: founder-led or small-team business coaches selling premium services through discovery calls.
- Secondary users: setters, closers, managers, and assistants working inside the same sales process.
- Likely team shape inferred from the schema and UI: solo coach, coach plus assistant, or small remote sales team.

## User Needs

- See all leads in one place with pipeline visibility.
- Store structured lead data, notes, custom fields, and message history.
- Score or prioritize leads so the team knows who to contact first.
- Book calls through branded public booking links.
- Sync availability with a calendar provider.
- Track call outcomes and convert qualified leads into customers.
- Manage team roles, invites, and shared organization settings.
- Create Stripe products, invoices, and payment records without leaving the app.
- Keep local setup and day-to-day admin simple enough for a small SaaS team to support.

## Business Goals

- Increase lead-to-booked-call conversion.
- Reduce the manual work needed to run a coaching sales pipeline.
- Provide a sticky workflow that spans CRM, scheduling, and billing.
- Support multi-tenant SaaS usage with a single deployable application.
- Stay simple enough to run reliably on Vercel with low operational overhead.

## Success Metrics

- Time to first successful team onboarding.
- Percentage of active teams that create at least one booking link.
- Percentage of booked calls with a recorded outcome.
- Percentage of paying teams that create at least one Stripe product or invoice.
- Lead-to-booked-call conversion rate by team.
- API error rate for booking, auth completion, and billing routes.
- Webhook success rate and duplicate-handling reliability for Stripe events.
- Local setup success for a new developer within one session.

## Functional Requirements

- Authentication and identity
  - Users must be able to log in and register.
  - Team invite acceptance and post-login team assignment must work reliably.
  - Assumption: Supabase Auth is the long-term primary auth system, even though a legacy registration path still writes directly to Postgres.
- Team and organization context
  - A user must be associated with a team and organization context.
  - The app must support invites, membership, and role-aware access.
- CRM
  - Users must be able to create, read, update, and delete leads.
  - Leads must support structured fields, custom fields, notes, owners, stage assignment, and scoring.
  - Users must be able to view dashboards, pipeline views, messages, and lead detail screens.
- Booking
  - Users must be able to create and manage public booking links.
  - Public booking pages must render organization branding and availability.
  - Booking workflows must support call booking, invite flows, and outcome tracking.
- Calendar integration
  - Users must be able to connect Google Calendar for availability and scheduling support.
- Billing
  - Authorized users must be able to manage Stripe products, prices, invoices, customers, and payments.
  - Stripe webhook processing must remain the source of truth for asynchronous billing state.
- Platform operations
  - The product must be deployable as a single web app on Vercel without requiring custom infrastructure for the near term.

## Non-Functional Requirements

- Code should favor simple framework-native patterns over custom abstractions.
- Local development must work with a small number of clear env vars and standard npm scripts.
- Production deployment must be compatible with Vercel Node.js runtimes.
- Sensitive logic must stay on the server and avoid exposing service-role credentials.
- Auth, billing, and booking flows should fail clearly and log enough detail to debug issues.
- The repository should maintain strict TypeScript and basic automated verification in CI.
- The product should avoid infrastructure that is hard to run locally unless there is a proven need.

## Constraints and Assumptions

- Current stack constraint: Next.js 16, React 19, Supabase, Stripe, and some direct `pg` usage already exist.
- Deployment constraint: many API routes explicitly require the Node.js runtime and are not suitable for Edge.
- Operational constraint: the repo currently has no worker system, queue, or separate backend service.
- Schema constraint: some data models appear to be in transition, including team/org linkage and legacy lead stage fields.
- Assumption: Vercel will host the web app, while Supabase hosts auth/data/storage and Stripe handles billing infrastructure.
- Assumption: near-term scale is small-to-medium SaaS traffic, not massive real-time throughput.

## Risks

- Hybrid auth and registration flows increase maintenance cost and can create inconsistent user records.
- Direct Postgres access through `pg` is a likely Vercel pain point if connection management is not kept minimal.
- Large client components and large route handlers make bugs harder to isolate and regressions harder to test.
- Authorization appears inconsistent across older routes, especially where `teamId` comes from query params or request bodies.
- Environment setup is under-documented today: `README.md` references `.env.example`, but that file does not exist.
- Webhook-heavy billing flows depend on database correctness and idempotency guarantees.

## Out of Scope

- Mobile apps.
- Complex workflow automation or background job systems.
- Multi-service or microservice decomposition.
- Deep analytics/BI beyond the existing dashboards.
- Built-in email marketing, SMS campaigns, or broad marketing automation.
- Enterprise-grade custom infrastructure before the core CRM/booking/billing path is stable.

## Recommended Near-Term Priorities

- Standardize auth and authorization checks across API routes before production deployment.
- Remove or isolate the legacy direct-Postgres registration path so Vercel deployment stays straightforward.
- Break up the largest CRM client components and oversized route handlers only where readability clearly improves.
- Add an `.env.example` and tighten environment-variable documentation before onboarding more developers.
- Expand tests around onboarding, booking, and billing routes instead of adding new product surface area first.
