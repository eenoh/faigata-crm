# Faigata Translation Build Plan

## Goal

Ship app-wide language switching where:

- the user selects a preferred language on `src/components/ProfileSettingsClient.tsx`
- static UI is translated with `next-intl`
- user-entered content is translated through LibreTranslate
- changing language refreshes every open tab and rerenders server and client content
- edit and delete flows keep working safely and never depend on translated identifiers
- the app remains hosted on Vercel, while the translation engine runs outside Vercel

## What Already Exists

These pieces are already a good foundation and should be extended, not replaced:

- `src/app/layout.tsx`
  - already wraps the app in `NextIntlClientProvider`
  - already passes `locale` and `messages`
- `src/context/LocaleContext.tsx`
  - already writes the locale cookie
  - already updates `document.documentElement`
  - already uses `localStorage` plus `router.refresh()` for cross-tab refresh
- `src/i18n/config.ts`
  - already defines supported locales and cookie/header names
- `src/i18n/request.ts`
  - already resolves locale from header, cookie, profile, then fallback
- `src/lib/supabase/middleware.ts`
  - already injects `x-faigata-locale` and syncs the locale cookie on protected routes
- `supabase/migrations/20260320173000_add_profiles_preferred_language.sql`
  - already adds `profiles.preferred_language`
- `src/features/i18n/server/customValueTranslations.ts`
  - already provides a reusable persistence layer for translated source texts
- `src/features/i18n/server/dynamicDisplayTranslation.ts`
  - already skips IDs, URLs, emails, phone numbers, timestamps, and similar raw values
- `src/features/i18n/server/libreTranslate.ts`
  - already has timeout handling, unsupported-locale caching, and network cooldown logic

## Core Architecture Decision

Use this target model:

1. Static UI
   - `next-intl` only
   - all visible labels, headings, empty states, metadata, menu items, button text, and validation copy come from `messages/*.json`

2. Dynamic user-entered content
   - store the source text once
   - translate on read or cache translations in `custom_value_translation_sources` and `custom_value_translations`
   - only translate display values, never identifiers or write keys

3. Locale state
   - profile setting is the durable source of truth
   - cookie is the fast server-read value
   - `LocaleContext` is the active browser state
   - every tab listens for locale changes and calls `router.refresh()`

4. Hosting
   - keep Next.js on Vercel
   - do not run LibreTranslate inside Vercel Functions
   - run LibreTranslate as a separate service behind HTTPS

## Important Product Rules

- Never translate or mutate IDs, slugs, UUIDs, Stripe IDs, emails, URLs, phone numbers, timestamps, or raw machine values.
- Edit forms must submit canonical source values, not translated display labels.
- Delete pages must target records by stable ID only.
- List/detail/read screens may show translated labels, but write/delete routes must keep source data intact.
- If translation fails, the source text must still render and the user must still be able to continue.

## Recommended Hosting Topology

### Recommended production setup

- Vercel
  - hosts the Next.js app
  - calls translation only from server-side code
- Separate translation service
  - LibreTranslate in Docker or Gunicorn
  - hosted on Railway, Fly.io, Render, Hetzner, VPS, or Kubernetes
- Optional cache layer
  - Postgres tables already exist for persistent translation caching
  - Redis is optional later for short-lived hot cache

### Why not run LibreTranslate on Vercel

- LibreTranslate is a long-running service with language models and heavier startup/runtime needs.
- Vercel is great for the web app, but not a good fit for hosting the translation engine itself.
- The better production model is: Vercel app -> server-side HTTP call -> external LibreTranslate service.

### Production rollout guidance

- Phase 1 production target:
  - one small external LibreTranslate instance
  - only the languages you actually support loaded at boot
  - HTTPS endpoint stored in `LIBRETRANSLATE_URL`
- Phase 2 production target:
  - health checks
  - rate limiting
  - auth via `LIBRETRANSLATE_API_KEY`
  - metrics and alerting
- Phase 3 production target:
  - horizontal scaling or a queue if translation volume becomes large
  - provider abstraction so you can swap LibreTranslate later without rewriting the app

## Phases

## Phase 0: Stabilize The Locale Contract

### Goal

Make locale switching globally reliable before translating more screens.

### Files to change

- `src/context/LocaleContext.tsx`
  - keep the current approach
  - add a `BroadcastChannel` fallback or enhancement beside `storage` events for faster tab sync
  - expose a single `setLocale()` contract for the whole app
  - optionally include a change timestamp/payload in storage to avoid stale events
- `src/app/layout.tsx`
  - keep as root provider boundary
  - verify `lang` and `dir` always come from the resolved locale after refresh
- `src/lib/supabase/middleware.ts`
  - keep locale header injection
  - verify protected and semi-protected routes always receive the locale cookie/header
- `src/features/i18n/client/requestLocale.ts`
  - keep as the browser locale helper
  - extend it into the standard way to attach locale headers on every API fetch
- `src/lib/http/request.ts`
  - likely add a shared locale-aware fetch helper here instead of repeating `authedFetch` patterns across components
- `src/i18n/request.ts`
  - keep the resolution order
  - make sure profile locale, cookie locale, and header locale all stay consistent
- `src/i18n/config.ts`
  - keep as the single locale registry
  - verify labels, text direction, cookie config, and supported-locale list stay aligned

### Exit criteria

- changing language in profile updates the cookie, context, and every open tab
- every tab rerenders server components after the locale switch
- every client fetch helper can attach the same locale header consistently

## Phase 1: Finish Static UI Coverage With `next-intl`

### Goal

Every visible static string comes from `messages/*.json`.

### Root files

- `messages/en.json`
  - complete the English source catalog
  - treat this as the canonical key structure
- `messages/*.json`
  - mirror the English structure
  - keep missing-key fallback safe while translation is incomplete
- `src/i18n/domain-values.ts`
  - continue to centralize enum/status/role labels
  - expand it before duplicating label logic in page components

### Page wrappers and metadata

All of these currently need metadata localization review. Move hardcoded metadata into `generateMetadata()` with `getTranslations()` or a central helper:

- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/register/page.tsx`
- `src/app/(app)/billing/page.tsx`
- `src/app/(app)/billing/customers/page.tsx`
- `src/app/(app)/billing/invoices/page.tsx`
- `src/app/(app)/billing/invoices/new/page.tsx`
- `src/app/(app)/billing/invoices/[invoiceId]/page.tsx`
- `src/app/(app)/billing/payments/page.tsx`
- `src/app/(app)/billing/payments/failed/page.tsx`
- `src/app/(app)/billing/payments/[id]/page.tsx`
- `src/app/(app)/billing/products/page.tsx`
- `src/app/(app)/billing/products/new/page.tsx`
- `src/app/(app)/billing/products/[productId]/page.tsx`
- `src/app/(app)/billing/products/[productId]/edit/page.tsx`
- `src/app/(app)/billing/products/[productId]/delete/page.tsx`
- `src/app/(app)/calendar/page.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/leads/page.tsx`
- `src/app/(app)/leads/new/page.tsx`
- `src/app/(app)/leads/[id]/page.tsx`
- `src/app/(app)/leads/[id]/edit/page.tsx`
- `src/app/(app)/leads/[id]/delete/page.tsx`
- `src/app/(app)/leads/[id]/messages/page.tsx`
- `src/app/(app)/leads/[id]/calls/page.tsx`
- `src/app/(app)/leads/[id]/calls/[bookingId]/page.tsx`
- `src/app/(app)/leads/[id]/calls/[bookingId]/view/page.tsx`
- `src/app/(app)/pipeline/page.tsx`
- `src/app/(app)/settings/page.tsx`
- `src/app/(app)/settings/booking-links/page.tsx`
- `src/app/(app)/settings/booking-links/new/page.tsx`
- `src/app/(app)/settings/booking-links/[id]/delete/page.tsx`
- `src/app/(app)/settings/conversion-metrics/page.tsx`
- `src/app/(app)/settings/lead-fields/page.tsx`
- `src/app/(app)/settings/lead-scoring/page.tsx`
- `src/app/(app)/settings/niches/page.tsx`
- `src/app/(app)/settings/pipeline-stages/page.tsx`
- `src/app/(app)/settings/team/invite/page.tsx`
- `src/app/(app)/settings/team/members/page.tsx`
- `src/app/(app)/settings/team/members/[userId]/delete/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/profile/integrations/page.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/invite/accept/page.tsx`
- `src/app/page.tsx`

### Shared shells and cross-feature UI

- `src/components/layout/ProductSuiteShellClient.tsx`
  - check for any hardcoded shell copy or aria labels
- `src/components/layout/ProductSuiteSidebar.tsx`
  - keep using `next-intl`, expand remaining nav labels if needed
- `src/features/crm/components/layout/AppSidebar.tsx`
  - already localized in part, finish any remaining hardcoded labels
- `src/features/crm/components/layout/AppHeader.tsx`
  - ensure all menu text, status text, and integration state labels are from translations

### Shared top-level clients

- `src/components/LoginPageClient.tsx`
- `src/components/RegisterPageClient.tsx`
- `src/components/ProductSuitePageClient.tsx`
- `src/components/ProfileSettingsClient.tsx`
- `src/components/IntegrationsClient.tsx`

Action for these files:

- remove remaining hardcoded strings
- move inline error copy into message catalogs
- make all fetch-triggered status messages locale-aware

### Exit criteria

- no hardcoded English UI in layouts, top nav, auth, profile, settings, CRM, or billing wrappers
- page metadata is localized
- `messages/en.json` is complete enough to be the reference source

## Phase 2: Complete The Profile Language Switch

### Goal

Make `ProfileSettingsClient.tsx` the single user-facing language switch and ensure it updates the entire app.

### Files to change

- `src/components/ProfileSettingsClient.tsx`
  - keep current preferred-language load/save flow
  - remove any locale-specific message loading that only exists for the profile screen if it can be replaced by shared `next-intl` or shared domain-value helpers
  - on save, keep updating `profiles.preferred_language`
  - keep calling `setLocale(nextLocale)` after successful save
- `src/context/LocaleContext.tsx`
  - ensure the locale change event reaches every tab
  - ensure refresh is immediate enough for server-rendered pages
- `src/lib/supabase/middleware.ts`
  - confirm cookie refresh works for tabs that were opened before the profile change
- `src/app/profile/page.tsx`
  - localize metadata
  - verify it imports the correct client component path

### Recommendation

Do not reimplement locale logic on every page. Expand `LocaleContext` and standardize fetch helpers instead. Pages should consume the locale, not own it.

### Exit criteria

- one profile change updates all open tabs
- freshly opened pages use the new language without logging out
- no page keeps stale locale after `router.refresh()`

## Phase 3: Standardize Locale-Aware Fetching

### Goal

Every client request that returns localized data sends the locale header.

### Files to change first

- `src/features/crm/data/leadFields.ts`
  - already good; keep as reference implementation
- `src/features/crm/data/pipelineStages.ts`
  - already good; keep as reference implementation
- `src/features/crm/data/niches.ts`
  - expand `getTeamNicheSettings`, `saveTeamNicheSelections`, and `createCustomNiche` to accept locale and send it
- `src/features/crm/data/conversionMetricDefinitions.ts`
  - currently missing locale header support
  - add locale argument and `withLocaleHeader`

### Billing client fetchers to refactor through a shared helper

- `src/features/billing/components/BillingClient.tsx`
- `src/features/billing/components/BillingCustomersClient.tsx`
- `src/features/billing/components/BillingInvoicesClient.tsx`
- `src/features/billing/components/BillingProductsClient.tsx`
- `src/features/billing/components/FailedPaymentsClient.tsx`
- `src/features/billing/components/InvoiceDetailClient.tsx`
- `src/features/billing/components/NewInvoiceClient.tsx`
- `src/features/billing/components/PaymentDetailClient.tsx`
- `src/features/billing/components/PaymentsClient.tsx`
- `src/features/billing/components/ProductArchiveClient.tsx`
- `src/features/billing/components/ProductDetailClient.tsx`
- `src/features/billing/components/ProductFormClient.tsx`

### CRM client files to audit for direct `fetch(...)`

- `src/features/crm/components/AcceptInviteClient.tsx`
- `src/features/crm/components/CalendarClient.tsx`
- `src/features/crm/components/CallDetailClient.tsx`
- `src/features/crm/components/CallOutcomeClient.tsx`
- `src/features/crm/components/CallsListClient.tsx`
- `src/features/crm/components/ConversionMetricDefinitionsSettingsClient.tsx`
- `src/features/crm/components/CreateSchedulePageClient.tsx`
- `src/features/crm/components/DashboardClient.tsx`
- `src/features/crm/components/DeleteLeadClient.tsx`
- `src/features/crm/components/DeleteSchedulePageClient.tsx`
- `src/features/crm/components/DeleteTeamMemberClient.tsx`
- `src/features/crm/components/EditLeadClient.tsx`
- `src/features/crm/components/InviteTeamMemberClient.tsx`
- `src/features/crm/components/LeadDetailClient.tsx`
- `src/features/crm/components/LeadFieldsSettingsClient.tsx`
- `src/features/crm/components/LeadMessagesClient.tsx`
- `src/features/crm/components/LeadsClient.tsx`
- `src/features/crm/components/LeadScoringSettingsClient.tsx`
- `src/features/crm/components/ManageTeamRolesClient.tsx`
- `src/features/crm/components/NewLeadClient.tsx`
- `src/features/crm/components/NicheSettingsClient.tsx`
- `src/features/crm/components/OnboardingPageClient.tsx`
- `src/features/crm/components/PipelineClient.tsx`
- `src/features/crm/components/PipelineStagesSettingsClient.tsx`
- `src/features/crm/components/SettingsBookingLinksClient.tsx`
- `src/features/crm/components/SettingsPageClient.tsx`

### Shared clients to audit for direct `fetch(...)`

- `src/components/LoginPageClient.tsx`
- `src/components/RegisterPageClient.tsx`
- `src/components/ProductSuitePageClient.tsx`
- `src/components/IntegrationsClient.tsx`

### Exit criteria

- every API request that depends on locale carries the same locale header
- locale changes in one tab affect API-backed labels in every other tab after refresh
- there is one shared pattern for locale-aware authed fetches

## Phase 4: Finish CRM Dynamic Content Translation

### Goal

Translate CRM user-entered content everywhere it is displayed, while preserving source values for writes.

### Files already partly integrated

- `src/features/crm/server/leads.handler.ts`
- `src/features/crm/server/pipeline-stages.handler.ts`
- `src/app/api/crm/lead-fields/route.ts`
- `src/app/api/crm/conversion-metrics/route.ts`
- `src/features/crm/server/niches.handler.ts`
- `src/features/crm/server/niches.service.ts`
- `src/features/crm/server/dashboard.handler.ts`
- `src/features/crm/server/dashboard-overview.handler.ts`
- `src/features/crm/server/dashboard-pipeline.handler.ts`
- `src/app/api/crm/booking-link/route.ts`
- `src/app/b/[slug]/page.tsx`

### Known gaps and follow-up tasks

- `src/app/b/[slug]/page.tsx`
  - currently translates `name` and `description`
  - also needs `confirmation_heading` and `confirmation_subheading` translated to match the booking-link API behavior
- `src/features/crm/components/PublicBookingPage.tsx`
  - verify every link field shown to guests is the translated display value, not just the raw DB value
- `src/features/crm/components/CreateSchedulePageClient.tsx`
  - verify create/update payloads capture the source locale for `name`, `description`, `confirmation_heading`, and `confirmation_subheading`
- `src/features/crm/components/LeadsClient.tsx`
  - keep using translated `displayValues`
  - make sure every dependent fetch carries locale
- `src/features/crm/components/LeadDetailClient.tsx`
  - audit all detail panels for translated display values vs raw source values
- `src/features/crm/components/EditLeadClient.tsx`
  - ensure edit forms load the source values for writing, not translated values
- `src/features/crm/components/NewLeadClient.tsx`
  - keep source values canonical on create
- `src/features/crm/components/DeleteLeadClient.tsx`
  - display translated labels if helpful, but delete strictly by `id`
- `src/features/crm/components/DeleteSchedulePageClient.tsx`
  - same rule: only translate display copy, never delete by translated label
- `src/features/crm/components/DeleteTeamMemberClient.tsx`
  - same rule: destructive action must remain ID-driven

### CRM API entrypoints to audit

- `src/app/api/crm/accept/route.ts`
- `src/app/api/crm/booking-invite/route.ts`
- `src/app/api/crm/booking-link/route.ts`
- `src/app/api/crm/booking-links/[slug]/availability/route.ts`
- `src/app/api/crm/booking-links/[slug]/book/route.ts`
- `src/app/api/crm/bookings/[bookingId]/route.ts`
- `src/app/api/crm/bookings/[bookingId]/outcome/route.ts`
- `src/app/api/crm/calendar/freebusy/route.ts`
- `src/app/api/crm/conversion-metrics/route.ts`
- `src/app/api/crm/dashboard/route.ts`
- `src/app/api/crm/dashboard/activity/route.ts`
- `src/app/api/crm/dashboard/overview/route.ts`
- `src/app/api/crm/dashboard/pipeline/route.ts`
- `src/app/api/crm/invite/accept/route.ts`
- `src/app/api/crm/lead-fields/route.ts`
- `src/app/api/crm/lead-messages/route.ts`
- `src/app/api/crm/lead-scoring/route.ts`
- `src/app/api/crm/lead-scoring-config/route.ts`
- `src/app/api/crm/leads/route.ts`
- `src/app/api/crm/leads/[id]/booking-invite/route.ts`
- `src/app/api/crm/leads/[id]/calls/route.ts`
- `src/app/api/crm/leads/[id]/reject/route.ts`
- `src/app/api/crm/niches/route.ts`
- `src/app/api/crm/onboarding/route.ts`
- `src/app/api/crm/pipeline-conversions/route.ts`
- `src/app/api/crm/pipeline-stages/route.ts`
- `src/app/api/crm/team-invites/route.ts`
- `src/app/api/crm/team-members/delete/route.ts`
- `src/app/api/crm/team-roles/route.ts`

Action for this route group:

- if the route returns human-readable labels, it must resolve the request locale
- if it creates or updates user-entered text, it must sync translation sources
- if it deletes translated entities, it must clean up translation source rows

### Exit criteria

- list/detail/dashboard/booking read views show translated display content
- edit/delete/create flows still write canonical source values
- translation source tables stay in sync after create, update, and delete

## Phase X: Fix Dynamic Translation Consistency

### Purpose

Close the gap between the current translation foundation and production behavior for already-created dynamic content, especially CRM activity timelines and detail screens.

This phase does not replace the earlier phases. It extends them by enforcing one rule everywhere:

- source data is canonical
- translated data is always derived
- read paths must be refreshable when locale changes
- no client screen may cache the request locale at mount if it renders locale-sensitive API data

### Phase X.1: Make locale-sensitive CRM clients reactive to locale changes

#### Goal

Ensure client components refetch locale-dependent data after `ProfileSettingsClient.tsx` calls `setLocale(...)` and `router.refresh()` propagates across tabs.

#### Reasoning

Several CRM clients currently snapshot the locale with `useMemo(() => resolveClientRequestLocale(), [])` or read it ad hoc during render. That makes the initial fetch correct, but prevents a later locale change from invalidating client-side API requests and causes stale mixed-language UI.

#### Files to change

- `src/features/crm/components/LeadDetailClient.tsx`
  - replace the memoized `resolveClientRequestLocale()` value with `useAppLocale()`
  - keep all lead, message, call, and billing-label fetch effects keyed by the live `locale`
  - reset `messagesLoading` and other fetch-loading state before locale-driven reloads so stale translated timeline entries do not remain visible during refresh
- `src/features/crm/components/LeadMessagesClient.tsx`
  - make the same change from mount-time locale snapshot to `useAppLocale()`
  - refetch both lead summary and timeline messages when locale changes
  - do not append newly-created translated display rows optimistically without either local formatting from canonical source or a follow-up refetch
- `src/features/crm/components/DeleteLeadClient.tsx`
- `src/features/crm/components/LeadScoringSettingsClient.tsx`
- `src/features/crm/components/ManageTeamRolesClient.tsx`
- `src/features/crm/components/NewLeadClient.tsx`
- `src/features/crm/components/NicheSettingsClient.tsx`
- `src/features/crm/components/PipelineClient.tsx`
  - audit every client that snapshots locale at mount and move it to `useAppLocale()` if the component fetches locale-sensitive data

#### Type of changes

- client state contract changes only
- no schema change
- no translation provider change
- eliminate mount-time locale snapshots for locale-sensitive fetches

### Phase X.2: Unify lead read-time translation around DB-backed canonical sources

#### Goal

Make lead reads deterministic and refreshable by resolving translated display values from `custom_value_translation_sources` and `custom_value_translations`, not from ad hoc in-memory translation alone.

#### Reasoning

`leads.handler.ts` currently mixes two translation models:

- stage and niche names use `applyEntityTranslations(...)` with DB-backed source rows
- lead core fields and custom values use `translateDynamicDisplayValuesBatch(...)`

That split means the same screen can show some fields from persistent translation state and others from ephemeral process memory. It also means `source_locale` and `source_hash` protection exist in storage, but are bypassed for `lead_name` and `display_values`.

#### Files to change

- `src/features/crm/server/leads.handler.ts`
  - extend `buildLeadTranslationFields(...)` to include `lead_name` and any other canonical display fields that should participate in translation-source syncing
  - stop using `translateDynamicDisplayValuesBatch(...)` as the primary read path for `lead_name`, `country`, `region`, `city`, `notes`, and custom text fields
  - instead, resolve `display_values` through `applyEntityTranslations(...)` or a new helper built on `resolveTranslationBatch(...)`, so read-time translation always uses canonical source rows plus `source_hash` freshness checks
  - continue to return raw source columns separately for edit flows
- `src/features/crm/components/LeadsClient.tsx`
  - keep consuming `displayValues` for read-only rendering
  - continue to use raw `customValues` and raw system fields for edit/navigation logic
  - treat `displayValues` as derived read-only data only
- `src/features/i18n/server/customValueTranslations.ts`
  - add a small helper for resolving multiple derived display fields onto an output map without mutating canonical DB columns
  - keep `source_hash_at_translation` freshness semantics as the primary stale-translation check
- `src/features/i18n/server/dynamicDisplayTranslation.ts`
  - demote this helper to fallback use for values that are truly display-only and do not have entity-backed translation sources
  - do not use it as the main path for lead fields that already have canonical translation-source rows

#### Type of changes

- server read-path refactor
- no schema change
- preserve current response shape: raw source fields plus derived `display_values`

### Phase X.3: Move activity timeline rendering from translated `body` strings to structured events

#### Goal

Guarantee that activity timelines re-render cleanly in any locale without translating protocol-like message bodies.

#### Reasoning

The timeline system already stores structured event metadata for many pipeline events:

- `lead_created`
- `lead_rejected`
- `call_attendance_updated`
- `call_offer_updated`
- `call_closed_updated`
- `call_booked`
- `booking_invite_created`

But the read path still formats timeline rows from `body` strings and English body prefixes. That blurs source data and display data, and forces the app to translate strings that are partly user-facing text and partly machine protocol.

#### Files to change

- `src/app/api/crm/lead-messages/route.ts`
  - include `event_type` and `event_data` in the select list for GET responses
  - stop translating pipeline rows through `translateDynamicDisplayValuesBatch(...)`
  - keep direct message bodies translatable, but resolve them through translation-source rows instead of bypassing the DB-backed system
  - when message bodies are user-generated and canonical, use `syncEntityTranslationSources(...)` on write and DB-backed translation resolution on read
- `src/features/crm/components/lead-detail/types.ts`
  - extend `LeadMessage` to include `event_type` and `event_data`
- `src/features/crm/components/lead-detail/timeline.ts`
  - replace English-string parsing as the primary contract with event-type based formatters
  - keep body parsing only as a backward-compatible fallback for legacy rows
  - move visible phrases like "New lead added", "Call status updated", and "Closed on call" behind `next-intl` keys or structured formatter inputs
- `src/features/crm/components/LeadDetailClient.tsx`
- `src/features/crm/components/LeadMessagesClient.tsx`
  - render pipeline timeline entries from `event_type` and `event_data`
  - use translated product labels, stage labels, and profile labels as derived inputs at render time
  - keep raw IDs inside `event_data` and never depend on translated text for actions
- `src/features/crm/server/leads.handler.ts`
- `src/app/api/crm/leads/[id]/reject/route.ts`
- `src/features/crm/server/booking-outcome.handler.ts`
- `src/features/crm/server/booking-link-book.handler.ts`
- `src/features/crm/server/booking-invite.handler.ts`
  - standardize timeline event producers so `event_type` and `event_data` are the canonical contract
  - keep `body` as legacy fallback text only where needed for backward compatibility

#### Type of changes

- API response contract extension
- client rendering refactor
- backward-compatible event formatting migration
- no destructive data migration required on day one

### Phase X.4: Fix source-locale handling and fallback rules for dynamic translations

#### Goal

Prevent incorrect retranslations when the original source text was not written in the default locale, and make fallback behavior explicit instead of accidental.

#### Reasoning

`translateDynamicDisplayValuesBatch(...)` defaults `sourceLocale` to `DEFAULT_LOCALE` when the caller does not provide it. That is safe only when the source text is actually in the default locale. For lead messages and lead display values created in another language, the current behavior can translate from the wrong source locale and produce poor or inconsistent results.

#### Files to change

- `src/features/i18n/server/dynamicDisplayTranslation.ts`
  - require callers to opt in explicitly when the source locale is unknown
  - add an observation path for `unknown_source_locale` instead of silently assuming the default locale for entity-backed data
  - keep skip rules for IDs, URLs, timestamps, and machine values, but refine the contract so caller intent is visible
- `src/features/i18n/server/customValueTranslations.ts`
  - keep source-locale bypass and `source_hash` freshness logic as the canonical behavior
  - expose a helper that returns source text when locale resolution is impossible instead of guessing a source locale
- `src/features/i18n/server/libreTranslate.ts`
  - no architectural rewrite needed
  - keep provider cooldown, unsupported-locale cache, and supported-language cache
  - add one metric dimension or log detail that makes it obvious when the caller supplied an unknown or defaulted source locale

#### Type of changes

- i18n contract tightening
- observability improvements
- preserve current provider safeguards and performance protections

### Phase X.5: Verification and rollout safety for dynamic consistency

#### Goal

Prove that a locale change updates every dynamic read surface without breaking edit/delete flows or overcalling the provider.

#### Reasoning

This issue is a consistency problem across client state, API contracts, and translation caches. It needs regression coverage at those boundaries, not just unit tests for one helper.

#### Files to change

- `tests/unit/custom-value-translations.test.ts`
  - add coverage for stale automatic translation refresh when `source_hash` changes
  - add coverage that source locale bypass returns canonical source text
- `tests/unit/dynamic-display-translation.test.ts`
  - add coverage for skip rules, explicit unknown-source-locale fallback, and non-default source locales
- `tests/unit/locale-context.test.ts`
  - verify `setLocale()` plus cross-tab sync causes locale-sensitive clients to reload
- new route tests for:
  - `src/app/api/crm/lead-messages/route.ts`
  - `src/app/api/crm/leads/route.ts`
  - confirm locale headers change derived display output without mutating source fields
- new e2e coverage for:
  - profile locale change while `LeadDetailClient` is open
  - profile locale change while `LeadMessagesClient` is open
  - previously-created timeline entries re-rendering in the new locale
  - edit and delete actions still using canonical source values and IDs only

#### Type of changes

- regression protection only
- no production schema change
- validate performance by counting cache hits vs provider calls

## Phase 5: Add Billing Translation Coverage

### Goal

Bring billing to the same level as CRM, especially for user-entered product/customer labels.

### Current state

Billing has localized UI components, but the server handlers and API routes do not yet follow the same locale-resolution and translation-source pattern as CRM.

### Files to review first

- `src/features/billing/server/products-list.handler.ts`
- `src/features/billing/server/products-create.handler.ts`
- `src/features/billing/server/products-sync.handler.ts`
- `src/features/billing/server/catalog.ts`
- `src/app/api/billing/customers/leads/route.ts`
- `src/app/api/billing/products/labels/route.ts`

### Billing API routes to audit

- `src/app/api/billing/customers/route.ts`
- `src/app/api/billing/customers/create/route.ts`
- `src/app/api/billing/customers/leads/route.ts`
- `src/app/api/billing/invoices/route.ts`
- `src/app/api/billing/invoices/create/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/finalize/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/items/create/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/send/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/uncollectible/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/void/route.ts`
- `src/app/api/billing/payments/list/route.ts`
- `src/app/api/billing/payments/[id]/route.ts`
- `src/app/api/billing/payments/[id]/refund/route.ts`
- `src/app/api/billing/prices/[priceId]/archive/route.ts`
- `src/app/api/billing/products/route.ts`
- `src/app/api/billing/products/create/route.ts`
- `src/app/api/billing/products/labels/route.ts`
- `src/app/api/billing/products/list/route.ts`
- `src/app/api/billing/products/sync/route.ts`
- `src/app/api/billing/products/[productId]/route.ts`
- `src/app/api/billing/products/[productId]/archive/route.ts`
- `src/app/api/billing/products/[productId]/prices/create/route.ts`
- `src/app/api/billing/products/[productId]/update/route.ts`

### Recommended implementation order

1. product labels and descriptions
2. customer lead labels
3. invoice line item human-readable descriptions
4. activity/history labels if you expose them in billing UI

### Exit criteria

- billing screens refresh into the selected locale just like CRM
- user-entered billing text can be translated without changing Stripe IDs or local IDs
- delete/archive/edit flows remain stable and ID-driven

## Phase 6: Harden The Translation Provider Layer

### Goal

Prepare LibreTranslate for real users and make the app resilient if translation is slow or unavailable.

### Files to change

- `src/features/i18n/server/libreTranslate.ts`
  - keep the current network protections
  - add structured provider-level logging and response metrics
  - optionally add batching if the external provider supports it later
- `src/features/i18n/server/customValueTranslations.ts`
  - keep DB-backed caching
  - add observability around cache hits vs provider calls
- `src/features/i18n/server/dynamicDisplayTranslation.ts`
  - refine skip rules as you find false positives or false negatives
- `src/lib/env/server.ts`
  - keep current env vars
  - optionally add future provider-agnostic variables such as `TRANSLATION_PROVIDER`
- `.env.example`
  - document production expectations for `LIBRETRANSLATE_URL`
  - add comments that the production URL should point to an external service, not Vercel

### Recommended new files

- `src/features/i18n/server/translationProvider.ts`
  - provider abstraction so the app does not depend directly on LibreTranslate forever
- `src/features/i18n/server/translationHealth.ts`
  - optional health-check helper for internal monitoring

### Operational focus

- health endpoint monitoring
- rate limiting
- request timeout budget
- language pack trimming
- retry strategy with safe fallback to source text
- alerting when the provider is down

### Exit criteria

- translation failures do not break page loads
- you can swap providers later with minimal app changes
- translation traffic is observable in production

## Phase 7: Testing And Regression Protection

### Goal

Make sure translation rollout does not break edit/delete behavior or multi-tab refresh.

### Existing test file to expand

- `tests/unit/custom-value-translations.test.ts`
  - add coverage for stale refresh, manual override preference, and unsupported-locale fallbacks

### Recommended new unit tests

- `tests/unit/locale-context.test.ts`
  - `setLocale()` updates cookie, DOM, and localStorage
  - storage/broadcast events refresh other tabs
- `tests/unit/request-locale.test.ts`
  - header > cookie > profile > default ordering
- `tests/unit/libretranslate.test.ts`
  - timeout fallback
  - unsupported locale cache
  - network cooldown behavior
- `tests/unit/dynamic-display-translation.test.ts`
  - raw identifiers are not translated
  - human-readable values are translated

### Recommended new route tests

- CRM read routes return translated display labels when locale header is set
- CRM write routes store source values and still return usable responses
- delete routes still succeed when the UI language is not English

### Recommended e2e coverage

- user changes preferred language in profile and another open tab rerenders
- lead list/detail screens update after a language switch
- booking page reflects translated labels
- delete pages still target the correct record
- edit forms still save canonical source values

## File Inventory By Area

## Core locale and config

- `next.config.ts`
- `middleware.ts`
- `src/app/layout.tsx`
- `src/context/LocaleContext.tsx`
- `src/i18n/config.ts`
- `src/i18n/request.ts`
- `src/i18n/routing.ts`
- `src/features/i18n/client/requestLocale.ts`
- `src/features/i18n/server/requestLocale.ts`
- `src/features/i18n/server/libreTranslate.ts`
- `src/features/i18n/server/customValueTranslations.ts`
- `src/features/i18n/server/dynamicDisplayTranslation.ts`
- `src/lib/env/server.ts`
- `.env.example`

## Message catalogs

- `messages/en.json`
- `messages/de.json`
- `messages/fr.json`
- `messages/es.json`
- `messages/pt.json`
- `messages/it.json`
- `messages/nl.json`
- `messages/pl.json`
- `messages/tr.json`
- `messages/uk.json`
- `messages/ru.json`
- `messages/ar.json`
- `messages/he.json`
- `messages/hi.json`
- `messages/bn.json`
- `messages/ur.json`
- `messages/zh.json`
- `messages/ja.json`
- `messages/ko.json`
- `messages/id.json`
- `messages/vi.json`
- `messages/th.json`
- `messages/sw.json`

## Shared components

- `src/components/IntegrationsClient.tsx`
- `src/components/LoginPageClient.tsx`
- `src/components/ProductSuitePageClient.tsx`
- `src/components/ProfileSettingsClient.tsx`
- `src/components/RegisterPageClient.tsx`
- `src/components/layout/ProductSuiteShellClient.tsx`
- `src/components/layout/ProductSuiteSidebar.tsx`

## CRM components and data helpers

- `src/features/crm/components/AcceptInviteClient.tsx`
- `src/features/crm/components/CalendarClient.tsx`
- `src/features/crm/components/CallDetailClient.tsx`
- `src/features/crm/components/CallOutcomeClient.tsx`
- `src/features/crm/components/CallsListClient.tsx`
- `src/features/crm/components/ConversionMetricDefinitionsSettingsClient.tsx`
- `src/features/crm/components/CreateSchedulePageClient.tsx`
- `src/features/crm/components/DashboardClient.tsx`
- `src/features/crm/components/DeleteLeadClient.tsx`
- `src/features/crm/components/DeleteSchedulePageClient.tsx`
- `src/features/crm/components/DeleteTeamMemberClient.tsx`
- `src/features/crm/components/EditLeadClient.tsx`
- `src/features/crm/components/InviteTeamMemberClient.tsx`
- `src/features/crm/components/LeadDetailClient.tsx`
- `src/features/crm/components/LeadFieldsSettingsClient.tsx`
- `src/features/crm/components/LeadMessagesClient.tsx`
- `src/features/crm/components/LeadsClient.tsx`
- `src/features/crm/components/LeadScoringSettingsClient.tsx`
- `src/features/crm/components/ManageTeamRolesClient.tsx`
- `src/features/crm/components/NewLeadClient.tsx`
- `src/features/crm/components/NicheSettingsClient.tsx`
- `src/features/crm/components/OnboardingPageClient.tsx`
- `src/features/crm/components/PipelineClient.tsx`
- `src/features/crm/components/PipelineStagesSettingsClient.tsx`
- `src/features/crm/components/PublicBookingPage.tsx`
- `src/features/crm/components/SettingsBookingLinksClient.tsx`
- `src/features/crm/components/SettingsPageClient.tsx`
- `src/features/crm/data/conversionMetricDefinitions.ts`
- `src/features/crm/data/leadFields.ts`
- `src/features/crm/data/niches.ts`
- `src/features/crm/data/pipelineStages.ts`
- `src/features/crm/server/custom-value-translations.ts`
- `src/features/crm/server/dashboard.handler.ts`
- `src/features/crm/server/dashboard-overview.handler.ts`
- `src/features/crm/server/dashboard-pipeline.handler.ts`
- `src/features/crm/server/leads.handler.ts`
- `src/features/crm/server/niches.handler.ts`
- `src/features/crm/server/niches.service.ts`
- `src/features/crm/server/onboarding.handler.ts`
- `src/features/crm/server/pipeline-stages.handler.ts`

## Billing components and handlers

- `src/features/billing/components/BillingClient.tsx`
- `src/features/billing/components/BillingCustomersClient.tsx`
- `src/features/billing/components/BillingInvoicesClient.tsx`
- `src/features/billing/components/BillingProductsClient.tsx`
- `src/features/billing/components/FailedPaymentsClient.tsx`
- `src/features/billing/components/InvoiceDetailClient.tsx`
- `src/features/billing/components/NewInvoiceClient.tsx`
- `src/features/billing/components/PaymentDetailClient.tsx`
- `src/features/billing/components/PaymentsClient.tsx`
- `src/features/billing/components/ProductArchiveClient.tsx`
- `src/features/billing/components/ProductDetailClient.tsx`
- `src/features/billing/components/ProductFormClient.tsx`
- `src/features/billing/server/catalog.ts`
- `src/features/billing/server/products-create.handler.ts`
- `src/features/billing/server/products-list.handler.ts`
- `src/features/billing/server/products-sync.handler.ts`

## App pages and public routes

- `src/app/page.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/register/page.tsx`
- `src/app/(app)/billing/page.tsx`
- `src/app/(app)/billing/customers/page.tsx`
- `src/app/(app)/billing/invoices/page.tsx`
- `src/app/(app)/billing/invoices/new/page.tsx`
- `src/app/(app)/billing/invoices/[invoiceId]/page.tsx`
- `src/app/(app)/billing/payments/page.tsx`
- `src/app/(app)/billing/payments/failed/page.tsx`
- `src/app/(app)/billing/payments/[id]/page.tsx`
- `src/app/(app)/billing/products/page.tsx`
- `src/app/(app)/billing/products/new/page.tsx`
- `src/app/(app)/billing/products/[productId]/page.tsx`
- `src/app/(app)/billing/products/[productId]/edit/page.tsx`
- `src/app/(app)/billing/products/[productId]/delete/page.tsx`
- `src/app/(app)/calendar/page.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/leads/page.tsx`
- `src/app/(app)/leads/new/page.tsx`
- `src/app/(app)/leads/[id]/page.tsx`
- `src/app/(app)/leads/[id]/calls/page.tsx`
- `src/app/(app)/leads/[id]/calls/[bookingId]/page.tsx`
- `src/app/(app)/leads/[id]/calls/[bookingId]/view/page.tsx`
- `src/app/(app)/leads/[id]/delete/page.tsx`
- `src/app/(app)/leads/[id]/edit/page.tsx`
- `src/app/(app)/leads/[id]/messages/page.tsx`
- `src/app/(app)/pipeline/page.tsx`
- `src/app/(app)/settings/page.tsx`
- `src/app/(app)/settings/booking-links/page.tsx`
- `src/app/(app)/settings/booking-links/new/page.tsx`
- `src/app/(app)/settings/booking-links/[id]/delete/page.tsx`
- `src/app/(app)/settings/conversion-metrics/page.tsx`
- `src/app/(app)/settings/lead-fields/page.tsx`
- `src/app/(app)/settings/lead-scoring/page.tsx`
- `src/app/(app)/settings/niches/page.tsx`
- `src/app/(app)/settings/pipeline-stages/page.tsx`
- `src/app/(app)/settings/team/invite/page.tsx`
- `src/app/(app)/settings/team/members/page.tsx`
- `src/app/(app)/settings/team/members/[userId]/delete/page.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/profile/integrations/page.tsx`
- `src/app/invite/accept/page.tsx`
- `src/app/b/[slug]/page.tsx`

## API route entrypoints to audit

- `src/app/api/auth/after-login/route.ts`
- `src/app/api/auth/complete-registration/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/billing/customers/route.ts`
- `src/app/api/billing/customers/create/route.ts`
- `src/app/api/billing/customers/leads/route.ts`
- `src/app/api/billing/invoices/route.ts`
- `src/app/api/billing/invoices/create/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/finalize/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/items/create/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/send/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/uncollectible/route.ts`
- `src/app/api/billing/invoices/[invoiceId]/void/route.ts`
- `src/app/api/billing/payments/list/route.ts`
- `src/app/api/billing/payments/[id]/route.ts`
- `src/app/api/billing/payments/[id]/refund/route.ts`
- `src/app/api/billing/prices/[priceId]/archive/route.ts`
- `src/app/api/billing/products/route.ts`
- `src/app/api/billing/products/create/route.ts`
- `src/app/api/billing/products/labels/route.ts`
- `src/app/api/billing/products/list/route.ts`
- `src/app/api/billing/products/sync/route.ts`
- `src/app/api/billing/products/[productId]/route.ts`
- `src/app/api/billing/products/[productId]/archive/route.ts`
- `src/app/api/billing/products/[productId]/prices/create/route.ts`
- `src/app/api/billing/products/[productId]/update/route.ts`
- `src/app/api/crm/accept/route.ts`
- `src/app/api/crm/booking-invite/route.ts`
- `src/app/api/crm/booking-link/route.ts`
- `src/app/api/crm/booking-links/[slug]/availability/route.ts`
- `src/app/api/crm/booking-links/[slug]/book/route.ts`
- `src/app/api/crm/bookings/[bookingId]/route.ts`
- `src/app/api/crm/bookings/[bookingId]/outcome/route.ts`
- `src/app/api/crm/calendar/freebusy/route.ts`
- `src/app/api/crm/conversion-metrics/route.ts`
- `src/app/api/crm/dashboard/route.ts`
- `src/app/api/crm/dashboard/activity/route.ts`
- `src/app/api/crm/dashboard/overview/route.ts`
- `src/app/api/crm/dashboard/pipeline/route.ts`
- `src/app/api/crm/invite/accept/route.ts`
- `src/app/api/crm/lead-fields/route.ts`
- `src/app/api/crm/lead-messages/route.ts`
- `src/app/api/crm/lead-scoring/route.ts`
- `src/app/api/crm/lead-scoring-config/route.ts`
- `src/app/api/crm/leads/route.ts`
- `src/app/api/crm/leads/[id]/booking-invite/route.ts`
- `src/app/api/crm/leads/[id]/calls/route.ts`
- `src/app/api/crm/leads/[id]/reject/route.ts`
- `src/app/api/crm/niches/route.ts`
- `src/app/api/crm/onboarding/route.ts`
- `src/app/api/crm/pipeline-conversions/route.ts`
- `src/app/api/crm/pipeline-stages/route.ts`
- `src/app/api/crm/team-invites/route.ts`
- `src/app/api/crm/team-members/delete/route.ts`
- `src/app/api/crm/team-roles/route.ts`
- `src/app/api/integrations/calendar/google/callback/route.ts`
- `src/app/api/integrations/calendar/google/clear-cookie/route.ts`
- `src/app/api/integrations/calendar/google/connect/route.ts`
- `src/app/api/integrations/calendar/google/disconnect/route.ts`
- `src/app/api/integrations/calendar/google/status/route.ts`
- `src/app/api/integrations/stripe/connect/route.ts`
- `src/app/api/integrations/stripe/connect/callback/route.ts`
- `src/app/api/integrations/stripe/disconnect/route.ts`
- `src/app/api/integrations/stripe/status/route.ts`
- `src/app/api/integrations/stripe/webhook/route.ts`
- `src/app/api/select-team/route.ts`
- `src/app/api/stripe/products/route.ts`
- `src/app/api/stripe/webhook/route.ts`

## Documentation and rollout support

- `README.md`
  - add translation architecture summary and production hosting guidance
- `documentation.md`
  - extend the existing locale section with dynamic-content translation and locale-aware fetch standards
- `ARCHITECTURE.md`
  - add the final translation flow diagram and provider topology

## Suggested implementation order

1. Phase 0 and Phase 2 together
2. Phase 1 static UI coverage
3. Phase 3 locale-aware fetch standardization
4. Phase 4 CRM dynamic translation completion
5. Phase X dynamic translation consistency fixes
6. Phase 5 billing translation coverage
7. Phase 6 production translation provider hardening
8. Phase 7 regression tests and docs cleanup

## External References

- Vercel Functions duration limits:
  - https://vercel.com/docs/functions/limitations
  - https://vercel.com/docs/functions/configuring-functions/duration
- LibreTranslate installation and production notes:
  - https://docs.libretranslate.com/it/guides/installation/
  - https://github.com/LibreTranslate/LibreTranslate

## Final Recommendation

The shortest safe path is:

- keep `LocaleContext` and expand it instead of rewriting locale state per page
- finish `next-intl` coverage for static UI
- standardize locale-aware fetch wrappers
- finish CRM translation coverage first
- add billing translation as a separate phase
- host LibreTranslate outside Vercel and call it only from server-side code
- treat edit/delete flows as source-value workflows with translated display only
