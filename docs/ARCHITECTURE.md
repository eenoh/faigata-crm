# Faigata Architecture

## Overview

Faigata is currently a single Next.js App Router application that serves:

- authenticated product pages,
- public booking pages,
- internal API routes,
- Stripe webhook endpoints,
- and Google/Stripe integration callbacks.

The repository already points in a sensible direction: `src/app` for framework entrypoints, `src/features` for domain logic, and `src/lib` for shared infrastructure. The main gap is consistency. Some flows follow that structure well, while older CRM and billing routes still contain substantial logic inline.

## Tech Stack

- Framework: Next.js 16 App Router
- UI: React 19
- Language: TypeScript with `strict: true`
- Styling: Tailwind CSS 4
- Auth and primary backend: Supabase
- Database access: Supabase clients plus limited direct `pg` access
- File/storage: Supabase Storage
- Billing: Stripe and Stripe Connect
- Calendar integration: Google Calendar OAuth
- Charts/UX libraries: Recharts, Framer Motion, Luxon
- Testing: Vitest and Playwright
- CI: GitHub Actions
- Package manager: npm with `package-lock.json`

## Application Structure

Current state:

- `src/app`
  - App Router pages, layouts, public routes, and API route entrypoints
- `src/features`
  - Domain-owned code for `auth`, `billing`, `crm`, `integrations`, and `organizations`
- `src/lib`
  - Shared env helpers, Supabase clients, Stripe helpers, auth/session parsing, HTTP helpers, validation, and Postgres access
- `src/components`
  - Cross-feature reusable components
- `src/context`
  - Client-side workspace and sidebar providers
- `src/types`
  - Shared TypeScript types, including database types

Current weak spot:

- The billing product catalog routes and CRM leads route now follow the feature-handler pattern, but compatibility wrappers such as `src/lib/supabaseAdmin.ts` and several `src/app/api/utils/*` modules still exist because older billing and CRM routes still depend on them.

## Runtime Model

Current state:

- The app uses a mixed Server Component and Client Component model.
- Many route pages are thin wrappers that render large client components.
- The protected shell layout at [`src/app/(app)/layout.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/app/(app)/layout.tsx) is fully client-side because it mounts context providers and shell UI.
- Public booking pages such as [`src/app/b/[slug]/page.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/app/b/[slug]/page.tsx) run on the server and use the Supabase admin client directly.
- Many API routes explicitly export `runtime = "nodejs"`.
- There is no middleware layer in the repo today.

Implication for Vercel:

- This app should be treated as a Node.js serverless deployment, not an Edge-first application.
- Billing, webhook, and any route using `pg`, Stripe, or Supabase admin access must stay on the Node runtime.

## Local Development Model

Current state:

- Scripts are standard npm scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test:unit`, `test:e2e`, and `check`.
- Development uses `next dev --webpack`.
- CI uses `npm install` and runs typecheck, lint, unit tests, and build.
- `README.md` instructs developers to copy `.env.example`, but `.env.example` is currently missing.
- `.env.local` exists locally and includes core Supabase, Stripe, and Google env vars, but not every variable referenced in code.

Recommendation:

- Add `.env.example` and keep env setup intentionally small.

## Deployment Model for Vercel

Current state:

- The codebase is compatible with Vercel in principle because it is a single Next.js app with API routes and no custom server.
- `serverEnv` already supports Vercel URL fallbacks for preview environments.
- Stripe and Google OAuth redirects are environment-sensitive and must be configured carefully.
- Many routes use `force-dynamic`, which is acceptable for authenticated dashboards and mutable APIs.

Pain points on Vercel:

- The legacy `pg` pool in [`src/lib/postgres/server.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/lib/postgres/server.ts) can become awkward in serverless environments if it expands beyond its current narrow use.
- Environment-variable management is incomplete and should be cleaned up before deployment.
- Large dynamic API handlers will be harder to monitor and debug once deployed.

Recommended deployment model:

- One Vercel project hosting the Next.js app.
- Supabase for auth, Postgres, and storage.
- Stripe for billing and webhooks.
- No additional services unless usage proves they are needed.

## Data Flow

Current state:

1. Browser loads pages from Next.js.
2. Large client components fetch or mutate data through App Router API routes.
3. API routes use Supabase admin/auth helpers, Stripe helpers, or feature handlers.
4. Public booking pages can fetch directly on the server with the admin client.
5. Stripe webhooks write invoice/payment state back into Supabase-managed tables.

Notable variations:

- Some new flows delegate cleanly to feature handlers.
- Some older routes still perform validation, authorization, DB access, and orchestration in a single file.

## State Management

Current state:

- Mostly local React state inside large client components.
- Two app-wide client contexts exist today:
  - [`src/context/WorkspaceContext.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/context/WorkspaceContext.tsx)
  - [`src/context/SidebarContext.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/context/SidebarContext.tsx)
- There is no dedicated global state library such as Redux or Zustand.

Assessment:

- This is simple and appropriate for the current size.
- The main issue is not lack of tooling; it is that several client components have become too large.

## API / Backend Boundaries

Current state:

- API routes live under `src/app/api`.
- Some routes are thin wrappers around feature handlers.
- Some routes still contain substantial business logic, auth checks, and external-service calls inline.
- Route-local utility wrappers remain in `src/app/api/utils`.

Current-state boundary problem:

- Backend rules are not centralized enough. Auth, org/team resolution, and billing context are implemented more than once.

Recommended future state:

- Keep API routes as thin HTTP boundaries.
- Move reusable domain logic into `src/features/<domain>/server`.
- Keep cross-domain infrastructure in `src/lib`.
- Avoid adding a second backend service.

## Authentication / Authorization

Current state:

- Supabase Auth is the primary identity system.
- Request auth parsing is centralized in [`src/lib/auth/session.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/lib/auth/session.ts).
- Older routes still use legacy wrappers like `supabaseAdmin` directly and perform their own token parsing or role resolution.
- Team/org membership is derived from `profiles`, `team_members`, invites, and organization mapping tables.
- There is no middleware-based session enforcement.
- A legacy registration flow in [`src/features/auth/server/register.handler.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/auth/server/register.handler.ts) writes directly to Postgres and hashes passwords with `bcrypt`, which does not match the otherwise Supabase-centric auth approach.

Recommended future state:

- Standardize all protected route auth on shared request helpers.
- Standardize role and org resolution in one place per domain.
- Retire or isolate the direct-Postgres registration path.

## Environment Variables and Configuration

Current code references these env families:

- Core app
  - `NEXT_PUBLIC_APP_URL`
  - `DATABASE_URL`
  - `VERCEL_ENV`
  - `VERCEL_URL`
  - `VERCEL_BRANCH_URL`
  - `VERCEL_PROJECT_PRODUCTION_URL`
- Supabase
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Google
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
  - `GOOGLE_OAUTH_STATE_SECRET`
- Stripe
  - `STRIPE_LIVEMODE`
  - `STRIPE_SECRET_KEY_TEST`
  - `STRIPE_SECRET_KEY_LIVE`
  - `STRIPE_CLIENT_ID_TEST`
  - `STRIPE_CLIENT_ID_LIVE`
  - `STRIPE_CONNECT_REDIRECT_URI_TEST`
  - `STRIPE_CONNECT_REDIRECT_URI_LIVE`
  - `STRIPE_CONNECT_STATE_SECRET`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_WEBHOOK_SECRET_TEST`
  - `STRIPE_WEBHOOK_SECRET_LIVE`
  - `STRIPE_PLATFORM_WEBHOOK_SECRET_TEST`
  - `STRIPE_PLATFORM_WEBHOOK_SECRET_LIVE`

Current issues:

- `.env.example` is missing.
- `.env.local` contains some keys that are not enforced or documented consistently.
- Some local keys present today are not enough to exercise all production flows, especially webhooks and legacy `DATABASE_URL` usage.

## External Services / Integrations

- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Stripe billing APIs
- Stripe Connect
- Google Calendar OAuth
- Direct Postgres connection through `pg` for legacy registration

## Performance Considerations

Current state:

- Several CRM client components are very large, especially:
  - [`src/features/crm/components/LeadDetailClient.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/LeadDetailClient.tsx)
  - [`src/features/crm/components/DashboardClient.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/DashboardClient.tsx)
  - [`src/features/crm/components/CreateSchedulePageClient.tsx`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/features/crm/components/CreateSchedulePageClient.tsx)
- Several API routes are also large, especially [`src/app/api/crm/leads/route.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/app/api/crm/leads/route.ts) and billing product routes.
- The app shell depends on client-side context initialization for workspace state.
- Many authenticated routes are intentionally dynamic.

Recommendation:

- Optimize for readability first.
- Split large files at natural seams before chasing lower-level micro-optimizations.

## Security Considerations

Current strengths:

- Service-role access is server-only.
- Stripe webhook verification exists.
- Google OAuth state and Stripe Connect state have dedicated handling.

Current risks:

- Authorization logic is duplicated and therefore easier to get wrong.
- Some older routes trust request parameters such as `teamId` more than they should.
- Missing env documentation increases the chance of misconfigured preview/production environments.
- Logging currently relies mostly on `console.error`, which is weak for auditability.

## Observability / Logging

Current state:

- Logging is mostly `console.error`.
- There is no structured logging, tracing, or dedicated error monitoring in the repo.

Practical recommendation:

- Keep logging simple, but add consistent request-scoped error messages for critical auth, booking, and billing flows.
- Add Vercel-compatible error monitoring later if production usage justifies it.

## Testing Strategy

Current state:

- Unit tests exist for env parsing, Stripe connect state, and some CRM server helpers.
- Playwright currently contains a minimal auth smoke test.
- CI does not run Playwright.

Recommended testing approach:

- Keep unit tests focused on validation, auth helpers, scoring helpers, and feature handlers.
- Add a small number of high-value route/integration tests for onboarding, booking, and billing.
- Add only a few end-to-end smoke tests for the critical happy paths.

## Technical Debt and Weak Spots

- Hybrid architecture: good target structure, incomplete adoption.
- Hybrid auth story: mostly Supabase, plus one direct-Postgres registration flow.
- Oversized client components and route handlers.
- Duplicate infrastructure wrappers across `src/lib` and `src/app/api/utils`.
- Missing `.env.example` and incomplete setup guidance.
- Shallow automated test coverage relative to the size of the route surface.
- Client-side workspace bootstrapping adds loading complexity that could move server-side later.

## Recommended Target Architecture

Keep the architecture simple:

- One Next.js App Router application.
- One shared `src/features` pattern for domain logic.
- One shared `src/lib` layer for infrastructure only.
- Supabase as the only application backend and database access layer for day-to-day product flows.
- Stripe webhooks as the async source of truth for billing state.
- No microservices, no queue, no separate API server for the near term.

Target-state changes worth making:

1. Make all API routes thin and move logic into feature server handlers.
2. Standardize auth and organization resolution so every protected route uses the same rules.
3. Remove or isolate the direct `pg` registration path to reduce Vercel operational risk.
4. Keep Server Components as the default and move shared workspace bootstrap logic server-side when convenient.
5. Reduce compatibility wrappers over time instead of adding new ones.

This target architecture is boring by design, which is the right tradeoff for a product that needs to stay easy to run locally and easy to host on Vercel.


## Internationalization Architecture

Faigata now uses `next-intl` for application internationalization.

Why `next-intl`:

- it supports the Next.js App Router cleanly
- it works well with Server Components and Client Components in the same app
- it allows incremental adoption without forcing runtime machine translation or invasive route rewrites
- it keeps message catalogs in source control, which is safer and easier to review than external translation APIs

Current locale model:

- routing is not locale-prefixed
- locale resolution is cookie and user-preference driven
- English (`en`) is the default fallback locale
- message loading falls back to English keys and values when locale-specific messages are missing

Locale configuration lives in:

- [`src/i18n/config.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/i18n/config.ts)
- [`src/i18n/routing.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/i18n/routing.ts)
- [`src/i18n/request.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/i18n/request.ts)
- [`middleware.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/middleware.ts)
- [`src/lib/supabase/middleware.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/lib/supabase/middleware.ts)
- [`next.config.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/next.config.ts)

Message catalogs live in:

- [`messages/en.json`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/messages/en.json)
- [`messages/de.json`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/messages/de.json)
- [`messages/fr.json`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/messages/fr.json)
- and the other locale files in `messages/`

Locale resolution order:

1. request header set during middleware for the active request
2. `faigata_locale` cookie
3. authenticated user's `profiles.preferred_language`
4. default fallback `en`

Persistence model:

- preferred language is stored in `public.profiles.preferred_language`
- the profile settings form writes locale codes such as `en`, `de`, or `fr`
- the profile page also updates the locale cookie immediately after a successful save so the UI rerenders in the selected language without waiting for another login or browser restart

Supported locales currently include:

- `en`, `de`, `fr`, `es`, `pt`, `it`, `nl`, `pl`, `tr`, `uk`, `ru`, `ar`, `he`, `hi`, `bn`, `ur`, `zh`, `ja`, `ko`, `id`, `vi`, `th`, `sw`

Database migration:

- [`supabase/migrations/20260320173000_add_profiles_preferred_language.sql`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/supabase/migrations/20260320173000_add_profiles_preferred_language.sql) adds `preferred_language text default 'en'` to `profiles`

Developer workflow notes:

- add new languages by appending the locale code and label in [`src/i18n/config.ts`](/C:/Users/beson/OneDrive/Dokumente/Coding/faigata/src/i18n/config.ts)
- create a matching `messages/<locale>.json` file by copying `messages/en.json`
- translate new UI by replacing hardcoded visible strings in touched components with `next-intl` keys and adding those keys to the appropriate namespace in `messages/en.json`
- keep English complete first; other locales can safely start as placeholders and be translated incrementally later
