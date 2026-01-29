# Lumo

**Lumo** is a multi-tenant, team-based CRM and booking platform designed for small teams and agencies to manage leads, pipelines, scoring, bookings, and external integrations (Google Calendar, Stripe) in one cohesive system.

It exists to centralize lead management, automate scoring and booking workflows, and provide a clean, extensible foundation for a modern SaaS CRM.

---

## Table of Contents

* [Overview](#overview)
* [Core Concepts](#core-concepts)
* [Architecture](#architecture)
* [Project Structure](#project-structure)
* [Data Model (Supabase)](#data-model-supabase)
* [Authentication & Authorization](#authentication--authorization)
* [Integrations](#integrations)
* [Scoring & Metrics](#scoring--metrics)
* [Installation & Setup](#installation--setup)
* [Configuration](#configuration)
* [Development](#development)
* [Troubleshooting](#troubleshooting)

---

## Overview

Lumo is built as a **Next.js App Router application** backed by **Supabase (PostgreSQL + Auth + Storage)**. It supports:

* Multiple organizations and teams
* Role-based access control (Admin / Manager / Closer / Setter / Prospector)
* Customizable pipelines and lead fields
* Lead scoring (rules + activity-based)
* Booking links and outcomes
* External integrations (Google Calendar, Stripe)

The system is intentionally modular: CRM logic, integrations, scoring, and UI concerns are separated to keep complexity manageable.

---

## Core Concepts

### Organization

* Represents a company or account
* Owns Stripe connections, branding, and billing configuration

### Team

* A workspace within an organization
* Owns leads, pipelines, metrics, and team members

### Profile

* One per authenticated user
* Stores name, avatar (profile pictures), role(s), team association

### Lead

* Central CRM entity
* Belongs to a team
* Moves through pipeline stages
* Has custom fields, messages, score, and bookings

---

## Architecture

### High-Level

```
Next.js App Router (UI)
        |
        v
API Routes (Server Actions / REST)
        |
        v
Supabase (Postgres + Auth + Storage)
```

### Key Design Decisions

* **Server-side authority**: All sensitive operations (deletes, role checks, integrations) happen in API routes using the Supabase service role.
* **Client = thin UI**: Clients fetch status and trigger actions; they never enforce security.
* **Explicit normalization**: CamelCase in the frontend, snake_case in the database.
* **Delete = soft-remove**: Team member removal clears associations instead of deleting users.

Tradeoffs:

* Slight duplication between client/server validation
* More API routes, but clearer boundaries

---

## Project Structure

```
src/
  app/
    api/                # Server routes (auth, CRM, integrations)
    profile/            # Profile & integrations UI
    settings/           # Team & member management
  components/           # Shared UI components
  context/              # React contexts (Workspace, Sidebar)
  lib/                  # Supabase, Stripe, helpers
  modules/
    crm/
      components/       # CRM UI components
      data/             # Client-side data access
      scoring/          # Lead scoring logic
      types/            # Shared CRM types
```

Key folders:

* `modules/crm/data` — client-side fetch helpers
* `app/api` — authorization + persistence layer
* `context/WorkspaceContext` — resolves current team

---

## Data Model (Supabase)

### Core Tables

* `profiles` — user profile, roles, team/org association
* `organizations` — company-level settings
* `teams` — workspaces
* `team_members` — membership + roles

### CRM Tables

* `leads`
* `pipeline_stages`
* `lead_fields`
* `lead_messages`
* `conversion_metrics`
* `lead_scoring_configs`

### Booking & Billing

* `booking_links`
* `bookings`
* `booking_outcomes`
* `organization_stripe_accounts`
* `organization_stripe_products`

Design notes:

* Most tables are scoped by `team_id`
* Stripe data is scoped by `org_id`
* RLS is bypassed in API routes via service role

---

## Authentication & Authorization

### Auth

* Supabase Auth (email/password)
* Client uses anon key
* Server uses service role key

### Roles

Stored in `profiles.role` as an array:

* `Admin`
* `Manager`
* `Closer`
* `Setter`
* `Prospector`

Rules:

* Admin: organization + billing access
* Manager: team & CRM management
* Closer: can edit call notes
* Setter: can store message & create booking links
* Prospector: adds leads to the database/workspace

All role checks are enforced server-side.

---

## Integrations

### Google Calendar

* OAuth 2.0 with offline access
* Tokens stored in `user_google_calendar_tokens`
* Supports reconnect flow
* Used for availability checks and event creation

Endpoints:

* `/api/integrations/calendar/google/connect`
* `/api/integrations/calendar/google/status`
* `/api/integrations/calendar/google/disconnect`

### Stripe (Test Mode)

* OAuth Connect
* One Stripe account per organization
* Used for invoices, products, payments

Endpoints:

* `/api/integrations/stripe/connect`
* `/api/integrations/stripe/status`
* `/api/integrations/stripe/disconnect`

---

## Scoring & Metrics

### Lead Scoring

Two-layer model:

1. **Rule-based score**

   * Configured per team
   * Based on custom fields

2. **Activity-based bonuses**

   * Inbound message frequency
   * Fast pipeline movement

Final score is clamped to `0–100`.

Key files:

* `modules/crm/scoring/scoreLead.ts`
* `modules/crm/scoring/recomputeLeadScore.ts`

### Conversion Metrics

* Define stage-to-stage conversions
* Optional `target_rate` stored as `int4`
* Used for reporting and forecasting

---

## Installation & Setup

### Requirements

* Node.js 18+
* Supabase project
* PostgreSQL (via Supabase)

### Setup

```bash
git clone <https://github.com/eenoh/faigata>
cd faigata
npm install
npm run dev
```

---

## Configuration

### Environment Variables

| Variable                        | Required | Description             |
| ------------------------------- | -------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | Supabase project URL    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Public anon key         |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes      | Server-side service key |
| `GOOGLE_CLIENT_ID`              | Yes      | Google OAuth client     |
| `GOOGLE_REDIRECT_URI`           | Yes      | Google OAuth redirect   |
| `STRIPE_CLIENT_ID_TEST`         | Yes      | Stripe Connect client   |
| `STRIPE_SECRET_KEY_TEST`        | Yes      | Stripe API key          |

---

## Development

### Local Development

```bash
npm run dev
```

### Conventions

* Tailwind CSS for styling
* Server logic only in `/api`
* No client-side role enforcement

### Recommended Next Steps

* Add automated tests for API routes
* Introduce audit logs for admin actions
* Harden RLS policies for read-only queries

---

## Troubleshooting

### Unauthorized API errors

* Ensure Authorization: Bearer <access_token> is sent
* Verify service role key exists on server

### Google Calendar shows "Reconnect required"

* Tokens expired or revoked
* Use reconnect flow in Integrations UI

### Lead score not updating

* Ensure `lead_scoring_configs` exists for team
* Check recent `lead_messages`

---

