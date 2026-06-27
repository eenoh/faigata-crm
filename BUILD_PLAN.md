# Faigata Build Plan Before Selling to Customers

## Goal

Ship a version of Faigata that is trustworthy enough for paying customers: secure auth boundaries, stable booking and billing flows, production-ready onboarding, and enough observability and test coverage to support real users without constant manual intervention.

## Current Readiness Assessment

The codebase already has real product value:

- strong product surface across CRM, booking, team management, and Stripe billing
- solid architectural direction with `src/features` and shared `src/lib` helpers
- meaningful unit tests around some auth, env, CRM, and Stripe helpers
- public booking and Stripe webhook flows are already implemented

The main reason it is not ready to sell broadly yet is not lack of features. It is launch risk:

- auth is still partially hybrid, with a legacy direct-Postgres registration path
- critical routes still contain large inline orchestration and inconsistent validation
- local quality gates are not green right now
- observability and operational tooling are too thin for paid support
- onboarding and production hardening are not complete enough for customer trust

## Phase 0: Make The Product Buildable And Verifiable

This phase is mandatory before anything else.

### Required changes

- Fix the broken TypeScript baseline.
  - `src/types/database.ts` currently breaks `tsc --noEmit` and must be corrected or regenerated.
- Fix the lint setup so it runs in CI and locally.
  - The current `eslint` run crashes inside the React rule stack.
- Make unit tests runnable in the current environment.
  - `vitest` currently fails during startup with `spawn EPERM`; the test runner/config/tooling needs to be adjusted so tests actually execute in CI and on developer machines.
- Add one command that developers can trust before merging.
  - `npm run check` should pass locally and in CI.
- Remove stray repo noise such as temporary files before launch.
  - Example: `testfile.tmp`.

### Exit criteria

- `typecheck`, `lint`, `test:unit`, and `build` all pass
- CI enforces those checks on every change
- the repo can be cloned and validated by a new developer without manual debugging

## Phase 1: Close Security And Authorization Gaps

This is the highest-risk customer-facing area.

### Required changes

- Eliminate the hybrid registration/auth model.
  - Replace or isolate `src/features/auth/server/register.handler.ts`, which still writes users and password hashes directly through `pg`.
  - Standardize on Supabase Auth as the single identity source.
- Standardize protected route authorization.
  - Every protected API route should resolve the authenticated user, active team, org membership, and role through shared helpers only.
  - Remove remaining patterns where `teamId`, `userId`, or similar context is accepted from request input unless it is verified against membership.
- Audit all customer-impacting routes for tenant isolation.
  - Focus on CRM, booking, billing, invite, and integration routes.
- Tighten validation for public booking and billing inputs.
  - Current handlers accept a lot of loosely typed JSON and normalize it inline.
- Review OAuth and webhook secrets/config fallbacks.
  - For example, Google OAuth state should not silently fall back to unrelated secrets in production.
- Define role permissions explicitly.
  - Document what admins, setters, closers, assistants, and members can and cannot do.

### Exit criteria

- one auth system
- one authorization pattern
- documented role matrix
- tenant isolation verified for all critical routes

## Phase 2: Harden Core Customer Workflows

If customers pay for this, these flows need to work predictably every time.

### Required changes

- Refactor oversized critical handlers into smaller domain services.
  - Priority examples:
    - `src/features/crm/server/leads.handler.ts`
    - `src/features/crm/server/booking-link-book.handler.ts`
    - billing webhook and product/invoice orchestration paths
- Make booking writes transactional where partial failure would confuse users.
  - Booking creation currently spans calendar creation, DB inserts, invite updates, lead updates, messages, and score updates with several non-fatal branches.
  - Define what is atomic, what is retryable, and what can safely fail asynchronously.
- Harden Stripe webhook persistence and error handling.
  - Failures on invoice/payment upserts should be detected, logged clearly, and retried safely.
  - Add explicit idempotency expectations for all webhook-side writes.
- Stabilize onboarding.
  - A new customer should be able to register, create a team, invite a teammate, create a booking link, connect calendar/Stripe, and complete a first booking/payment flow without internal intervention.
- Add graceful UX for third-party failure states.
  - calendar reconnect required
  - Stripe account disconnected
  - webhook lag or billing sync delay
  - missing configuration for booking hosts or products

### Exit criteria

- the end-to-end happy path works for a fresh account
- partial failures are either prevented or surfaced clearly
- support does not need database edits to rescue normal customer flows

## Phase 3: Add Production Observability And Supportability

You should not charge customers without being able to diagnose failures quickly.

### Required changes

- Replace scattered `console.error` logging with a consistent server logging strategy.
  - Include route/handler name, tenant context, user context where safe, external provider, and error class.
- Add error monitoring for production.
  - Use a Vercel-friendly service and wire it into auth, booking, billing, and webhook flows first.
- Add audit-friendly event logging for high-value actions.
  - invite accepted
  - role changed
  - booking created/cancelled
  - invoice created/sent/paid
  - Stripe account connected/disconnected
- Define operational dashboards.
  - webhook failures
  - booking failures
  - auth/onboarding failures
  - API 4xx/5xx volume
- Document support playbooks.
  - how to diagnose failed onboarding
  - how to diagnose missing Stripe data
  - how to handle reconnect-required Google accounts

### Exit criteria

- production errors are visible within minutes
- common support issues have a documented triage path
- you can answer "what failed, for whom, and since when?"

## Phase 4: Raise Test Coverage Around Revenue And Retention Paths

Right now the test surface is too shallow for a product this broad.

### Required changes

- Add route/integration tests for the paid product core:
  - auth and post-login team resolution
  - onboarding
  - lead CRUD with tenant enforcement
  - public booking link availability and booking
  - Stripe webhook processing
  - billing product/invoice/payment routes
- Expand end-to-end coverage beyond a login smoke test.
  - minimum customer journey:
    - register/login
    - onboarding
    - create booking link
    - book call
    - record outcome
    - create product/invoice
- Add regression tests for authorization edge cases.
  - wrong team
  - stale invite
  - disconnected integrations
  - invalid Stripe account mapping
- Add fixture/seeding strategy for local and CI testing.
  - auth users
  - tenant/team data
  - sample leads
  - billing records

### Exit criteria

- critical money and scheduling flows are covered by automated tests
- auth regressions are caught before deploy
- CI failure signals are reliable

## Phase 5: Improve Customer Onboarding, Trust, And Product Value Delivery

After the product is safe and reliable, make it easier to buy, adopt, and retain.

### Required changes

- Simplify first-run experience.
  - guided setup for workspace, team, booking link, calendar, and Stripe
- Make product positioning sharper inside the app.
  - explain who it is for and what the next action is at each stage
- Add empty states and guided defaults.
  - first pipeline stage set
  - sample lead fields
  - first booking link template
  - first invoice/product template
- Improve billing/customer-facing polish.
  - invoice/product naming clarity
  - better payment status messaging
  - clearer errors when Stripe is not fully connected
- Add customer-facing docs.
  - setup guide
  - booking setup guide
  - Stripe setup guide
  - team roles guide
  - troubleshooting guide

### Exit criteria

- a new customer can reach first value quickly
- support questions shift from setup confusion to real usage questions
- the product feels intentional, not just functional

## Phase 6: Launch Readiness And Commercial Preparation

This is the final gate before charging real customers.

### Required changes

- Define your minimum sellable offer.
  - who the first customers are
  - what exact workflows are supported
  - what is explicitly not supported yet
- Add production policies and legal basics.
  - privacy policy
  - terms of service
  - data handling/security statement
  - support expectations
- Validate billing mode separation.
  - test vs live Stripe configuration must be unambiguous
- Run a release hardening pass.
  - preview environment checks
  - production env checklist
  - webhook endpoint verification
  - OAuth redirect verification
- Do a small beta before wider sales.
  - onboard 3-5 real target users
  - collect failures, confusion, and missing-value signals
  - only open broader sales after repeated successful usage

### Exit criteria

- you know exactly what you are selling
- production configuration is repeatable
- a beta cohort has successfully used the core workflow

## Recommended Order Of Execution

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3 and Phase 4 in parallel
5. Phase 5
6. Phase 6

## Bottom Line

Faigata already looks like a real product, not a prototype. The biggest gap before selling is operational trustworthiness, not feature breadth. If you complete Phases 0 through 4, you should be in a much safer position to sell to early customers. Phases 5 and 6 are what turn that into a product customers can adopt confidently and recommend.
