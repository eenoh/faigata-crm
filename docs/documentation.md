# Faigata Documentation

## Project Overview

Faigata is a multi-tenant application that combines CRM, booking, and billing workflows in one Next.js App Router codebase.

Core domains:

- CRM for leads, pipeline management, messaging, scoring, and team workflows
- Booking for schedule pages, public booking links, invite-based booking, and outcomes
- Billing for Stripe-backed products, invoices, customers, and payments

Phase 1 of the build plan is now implemented around four goals:

- Supabase SSR auth wired in the same shape as the official Next.js guide
- shared server-side auth checks for login completion, registration completion, and onboarding
- explicit environment setup via `.env.example`
- focused tests for auth/session parsing, route guards, booking helpers, and webhook verification

## Phase 2 Status

Completed in this pass:

- Moved the remaining planned CRM hotspots into feature handlers so the App Router files are now thin wrappers:
  - [`src/features/crm/server/pipeline-stages.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/server/pipeline-stages.handler.ts)
  - [`src/features/crm/server/team-roles.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/server/team-roles.handler.ts)
  - [`src/features/crm/server/booking-outcome.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/server/booking-outcome.handler.ts)
  - [`src/features/crm/server/onboarding.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/server/onboarding.handler.ts)
  - [`src/features/crm/server/team-invites.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/server/team-invites.handler.ts)
- Moved the remaining planned billing hotspots into feature handlers:
  - [`src/features/billing/server/customers.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/billing/server/customers.handler.ts)
  - [`src/features/billing/server/product-prices-create.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/billing/server/product-prices-create.handler.ts)
  - [`src/features/billing/server/products-sync.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/billing/server/products-sync.handler.ts)
  - [`src/features/billing/server/product-archive.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/billing/server/product-archive.handler.ts)
- Added small shared server helpers for the extracted routes:
  - [`src/features/billing/server/http.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/billing/server/http.ts)
  - [`src/features/billing/server/catalog.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/billing/server/catalog.ts)
  - [`src/features/crm/server/team-roles.shared.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/server/team-roles.shared.ts)
- Split [`src/features/crm/components/LeadDetailClient.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/LeadDetailClient.tsx) by extracting shared lead-detail UI and timeline modules:
  - [`src/features/crm/components/lead-detail/ui.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/lead-detail/ui.tsx)
  - [`src/features/crm/components/lead-detail/timeline.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/lead-detail/timeline.ts)
  - [`src/features/crm/components/lead-detail/types.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/lead-detail/types.ts)
- Split [`src/features/crm/components/DashboardClient.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/DashboardClient.tsx) into shared dashboard types, helpers, and UI modules:
  - [`src/features/crm/components/dashboard/types.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/dashboard/types.ts)
  - [`src/features/crm/components/dashboard/helpers.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/dashboard/helpers.ts)
  - [`src/features/crm/components/dashboard/ui.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/dashboard/ui.tsx)

Phase 2 outcome:

- the planned CRM and billing route hotspots now keep business logic in `src/features/*/server` instead of inline in `route.ts`
- the migrated CRM and billing routes now resolve auth/team/org context through shared feature services rather than request-local variants
- `LeadDetailClient` and `DashboardClient` are materially smaller and organized around stable helper/UI submodules
- older compatibility wrappers still exist for some non-phase-2 billing endpoints, but they are now isolated from the migrated slice rather than extended further

Verification notes:

- I could not run `eslint`, `tsc`, or Vitest in this shell because `node`/`npm` are not available on PATH in the current environment
- verification here was limited to read-back inspection of the extracted handlers, wrapper entrypoints, and client-module splits
## Tech Stack

Framework and runtime:

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4

Platform and integrations:

- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Stripe Connect
- Stripe billing APIs
- Google Calendar OAuth
- node-postgres for one remaining legacy compatibility path

Tooling:

- ESLint
- Vitest
- Playwright
- GitHub Actions

## Phase 1 Status

Completed in this pass:

- Added `.env.example` with the currently required local and deployment variables.
- Added `middleware.ts` plus `src/lib/supabase/middleware.ts` to refresh Supabase sessions and protect private routes.
- Added `src/app/auth/confirm/route.ts` so email confirmation and code-exchange flows land back inside the app correctly.
- Moved `/api/auth/after-login` to a feature handler and standardized auth checks with `requireAuthenticatedRequestUser`.
- Updated registration completion and onboarding to verify the authenticated Supabase user instead of trusting a browser-provided `userId`.
- Added tests for session parsing, request-user guards, auth-sensitive routes, and Stripe webhook secret verification.

Not completed in this pass:

- removing the legacy direct-Postgres registration endpoint entirely
- refactoring the largest CRM and billing routes into feature handlers
- deeper route/integration coverage beyond the Phase 1 risk areas

## Authentication Architecture

### Baseline pattern

Authentication now follows the same core model shown in Supabase's Next.js guide:

- browser-side auth uses `@supabase/ssr` through `src/lib/supabase/browser.ts`
- server-side auth uses `src/lib/supabase/server.ts`
- middleware refreshes the session on navigation and protects private routes
- the auth confirmation route exchanges `code` or `token_hash` values into a server-side session

Key files:

- `middleware.ts`
- `src/lib/supabase/middleware.ts`
- `src/lib/supabase/browser.ts`
- `src/lib/supabase/server.ts`
- `src/app/auth/confirm/route.ts`

### Faigata-specific auth rules

Supabase Auth is only the identity layer. Faigata still applies project-specific team and role logic after authentication.

That logic now works like this:

1. A user signs in or signs up with Supabase Auth.
2. The client calls a server route with the active access token.
3. The server validates the real session through shared helpers.
4. The server resolves pending invites, profile data, team membership, and company linkage.
5. Roles are stored from invite/team membership data, not inferred from the browser.

### Shared request auth

`src/features/auth/server/request-auth.ts` is the shared guard for the high-risk Phase 1 routes.

Use it for routes that must ensure:

- there is a valid Supabase session
- the request is acting as the authenticated user
- any optional `userId` sent by the browser matches the session user

This guard is now applied to:

- `src/features/auth/server/after-login.handler.ts`
- `src/features/auth/server/complete-registration.handler.ts`
- `src/app/api/crm/onboarding/route.ts`

### Cookie and bearer handling

`src/lib/auth/session.ts` now supports:

- bearer tokens from `Authorization` headers
- direct access-token cookies
- chunked Supabase auth cookies created by SSR/session persistence

That fix matters because the newer SSR client can split larger auth cookies across multiple cookie keys.

## Protected Routes

The middleware protects the authenticated application surface:

- `/crm`
- `/dashboard`
- `/leads`
- `/pipeline`
- `/calendar`
- `/billing`
- `/settings`
- `/profile`
- `/onboarding`

Public routes intentionally stay open:

- `/`
- `/login`
- `/register`
- `/invite/accept`
- `/b/[slug]`
- public API/webhook endpoints that must remain externally reachable

## Team and Role Model

Faigata keeps its project model on top of Supabase Auth:

- `profiles` stores the user's current team and company linkage
- `team_members` stores explicit workspace membership
- `team_invites` and `team_invite_roles` drive invite acceptance and initial role assignment
- billing and CRM permissions still derive from team/company membership and role values

Important outcome of the Phase 1 auth work:

- the browser no longer gets to choose which user is being onboarded or attached to an invite
- the server always derives the acting user from the authenticated Supabase session first

## Environment Setup

Copy `.env.example` to `.env.local`.

### Required for local auth and core app usage

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Required for Stripe features

- `STRIPE_LIVEMODE`
- `STRIPE_SECRET_KEY_TEST`
- `STRIPE_SECRET_KEY_LIVE`
- `STRIPE_CLIENT_ID_TEST`
- `STRIPE_CLIENT_ID_LIVE`
- `STRIPE_CONNECT_REDIRECT_URI_TEST`
- `STRIPE_CONNECT_REDIRECT_URI_LIVE`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_SECRET_TEST`
- `STRIPE_WEBHOOK_SECRET_LIVE`

### Required for Google Calendar features

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

### Compatibility / advanced variables still referenced in the repo

- `DATABASE_URL`
- `GOOGLE_OAUTH_STATE_SECRET`
- `STRIPE_CONNECT_STATE_SECRET`
- `STRIPE_PLATFORM_WEBHOOK_SECRET_TEST`
- `STRIPE_PLATFORM_WEBHOOK_SECRET_LIVE`
- Vercel preview/prod URL variables used by `src/lib/env/server.ts`

## Node Runtime Notes

Critical server routes should stay on the Node runtime.

Explicit Node runtime routes in the Phase 1 auth path now include:

- `src/app/api/auth/after-login/route.ts`
- `src/app/api/auth/complete-registration/route.ts`
- `src/app/api/crm/onboarding/route.ts`
- `src/app/auth/confirm/route.ts`
- Stripe webhook routes and booking handlers already using Node runtime exports

## Folder Responsibilities

### `src/app`

Use this folder for App Router entrypoints only.

Examples:

- route groups and pages
- layouts
- public booking entrypoints
- thin API route wrappers

### `src/features`

Use this folder for domain-owned logic.

Current notable feature areas:

- `src/features/auth/server`
- `src/features/crm`
- `src/features/billing`
- `src/features/integrations/stripe/server`
- `src/features/organizations/server`

### `src/lib`

Use this folder for cross-feature infrastructure.

Current notable modules:

- `src/lib/env`
- `src/lib/supabase`
- `src/lib/stripe`
- `src/lib/auth`
- `src/lib/http`
- `src/lib/postgres`
- `src/lib/validation`

## Testing Coverage

Phase 1 verification now covers:

- auth session parsing and chunked cookie handling
- request-user guard behavior
- auth-sensitive route guard behavior for after-login, complete-registration, and onboarding
- booking helper behavior in existing CRM tests
- Stripe webhook verification secret selection

Relevant test files:

- `tests/unit/auth-session.test.ts`
- `tests/unit/request-auth.test.ts`
- `tests/unit/auth-route-guards.test.ts`
- `tests/unit/stripe-webhooks.test.ts`
- `tests/unit/crm-server-helpers.test.ts`

## Current Caveats

- `src/app/api/auth/register/route.ts` still exists as a legacy compatibility path and is not part of the preferred Supabase SSR auth flow.
- Some older CRM and billing APIs still contain inline orchestration and should move into feature handlers in later phases.
- The generated database types are still incomplete for parts of the live schema, so some server code uses narrow local casts.

## Recommended Workflow For Future Changes

When touching auth-sensitive code:

1. Prefer `src/lib/supabase/browser.ts` and `src/lib/supabase/server.ts` over ad hoc clients.
2. Use shared server-side auth guards before reading or writing user-owned data.
3. Resolve team/org/role context on the server, never from browser trust alone.
4. Keep App Router `route.ts` files thin when a flow grows beyond simple validation.
5. Add a focused unit test when changing auth, onboarding, booking, or webhook code.



## Internationalization

Faigata now uses `next-intl` as the project i18n layer.

Why `next-intl` was chosen:

- it is App Router compatible
- it works with server-rendered and client-rendered UI in the same codebase
- it supports incremental adoption without forcing a `[locale]` route segment rewrite across the whole authenticated app
- it keeps translations in local JSON catalogs that are easy to review and extend

This project uses a cookie and user-preference driven locale model instead of locale-prefixed routing.

How locale resolution works:

1. middleware refreshes the Supabase session and prepares locale context for the request
2. `next-intl` request config reads the request header when present
3. otherwise it uses the `faigata_locale` cookie
4. if no cookie is available, it checks the authenticated user's `profiles.preferred_language`
5. if nothing is set, it falls back to English (`en`)

Key files:

- [`next.config.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/next.config.ts)
- [`src/i18n/config.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/i18n/config.ts)
- [`src/i18n/routing.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/i18n/routing.ts)
- [`src/i18n/request.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/i18n/request.ts)
- [`src/app/layout.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/app/layout.tsx)
- [`src/lib/supabase/middleware.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/lib/supabase/middleware.ts)

Messages live in `messages/`.

Current workflow:

- `messages/en.json` is the source-of-truth catalog for touched UI
- non-English locale files currently mirror the English structure so real translations can be added later without refactoring
- missing keys fall back to English at load time by merging the locale catalog onto the English catalog

Preferred language storage:

- the profile form now reads and writes `profiles.preferred_language`
- the stored value is always a locale code like `en`, `de`, or `fr`
- successful profile saves also update the locale cookie immediately so the app can refresh into the newly selected language right away

Migration added:

- [`supabase/migrations/20260320173000_add_profiles_preferred_language.sql`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/supabase/migrations/20260320173000_add_profiles_preferred_language.sql)

How to add a new language:

1. Add the locale code to [`src/i18n/config.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/i18n/config.ts)
2. Add its display label to `LOCALE_LABELS`
3. Copy [`messages/en.json`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/messages/en.json) to `messages/<locale>.json`
4. Translate values progressively in that new file

How to translate new UI text:

1. Choose or add an appropriate namespace in `messages/en.json`
2. Replace hardcoded visible strings in the touched component with `useTranslations` or `getTranslations`
3. Keep English complete first, then copy the new keys into the other locale files

Developer note:

- this setup intentionally avoids machine translation services and large routing changes; it is meant to be maintainable, reviewable, and safe for the existing auth, theme, org, and profile flows
