// src/app/api/billing/customers/route.ts
import { NextResponse } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Authed = {
  userId: string;
  orgId: string; // the id we use to scope billing tables (org/team/company)
  livemode: boolean;
  stripeAccountId: string;
};

const PRIV_ROLES = new Set(["closer", "manager", "admin"]);

function normalize(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * profiles.role can be:
 * - text[] (array)
 * - text (single string)
 * - null
 */
function normalizeRoles(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((r) => String(r).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    return v ? [v] : [];
  }
  return [];
}

async function getUserFromBearer(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { user: null, token: null };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return { user: null, token: null };

  // Create a user-scoped client and validate the JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });

  // Supabase v2 supports passing the JWT directly:
  // (This avoids relying on global headers behavior)
  const { data, error } = await userClient.auth.getUser(token);
  if (error) return { user: null, token: null };

  return { user: data?.user ?? null, token };
}

async function getAuthedContext(req: Request): Promise<
  | { ok: true; ctx: Authed }
  | { ok: false; status: number; body: Record<string, any> }
> {
  const { user } = await getUserFromBearer(req);

  if (!user) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "unauthorized",
        hint: "Missing/invalid session. Ensure the client sends Authorization: Bearer <access_token>.",
      },
    };
  }

  const sb = adminClient();

  // Pull both team_id and company_id so we can resolve whichever you use as org_id.
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("team_id, company_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "forbidden",
        hint: "Profile not found or unreadable (RLS/admin client issue).",
      },
    };
  }

  const roles = normalizeRoles(profile.role);
  const privileged = roles.some((r) => PRIV_ROLES.has(r));

  if (!privileged) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "forbidden",
        hint: "User lacks privileged role (closer/manager/admin).",
        roles,
      },
    };
  }

  // ✅ This is the critical part:
  // You currently treat profiles.team_id as orgId.
  // But your stripe account mapping table is called organization_stripe_accounts(org_id,...)
  // and org_id might actually store company_id or organizations.id instead.
  const candidates = [
    profile.team_id ? String(profile.team_id) : null,
    profile.company_id ? String(profile.company_id) : null,
  ].filter(Boolean) as string[];

  if (candidates.length === 0) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "missing_workspace",
        hint: "profiles.team_id and profiles.company_id are both null.",
      },
    };
  }

  const livemode = false; // test-only for now

  // Try to find a connected account for any candidate workspace id.
  let stripeAccountId: string | null = null;
  let resolvedOrgId: string | null = null;

  for (const candidateOrgId of candidates) {
    const { data: acct, error: acctErr } = await sb
      .from("organization_stripe_accounts")
      .select("stripe_account_id")
      .eq("org_id", candidateOrgId)
      .eq("livemode", livemode)
      .maybeSingle();

    if (!acctErr && acct?.stripe_account_id) {
      stripeAccountId = String(acct.stripe_account_id);
      resolvedOrgId = candidateOrgId;
      break;
    }
  }

  if (!stripeAccountId || !resolvedOrgId) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "no_connected_stripe_account",
        hint:
          "No row found in organization_stripe_accounts for this user workspace. " +
          "Make sure organization_stripe_accounts.org_id matches profiles.team_id (or profiles.company_id) for livemode=false.",
        candidates,
        livemode,
      },
    };
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      orgId: resolvedOrgId,
      livemode,
      stripeAccountId,
    },
  };
}

export async function GET(req: Request) {
  const authRes = await getAuthedContext(req);

  if (!authRes.ok) {
    // Return specific status so you don't confuse "no stripe account" with "unauthorized"
    return NextResponse.json(authRes.body, { status: authRes.status });
  }

  const { ctx } = authRes;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  const stripe = stripeClient(ctx.livemode);
  const sb = adminClient();

  // 1) Fetch customers from Stripe (connected acct)
  const list = await stripe.customers.list(
    { limit: 50, ...(q.includes("@") ? { email: q } : {}) },
    { stripeAccount: ctx.stripeAccountId }
  );

  const customers = list.data.map((c) => ({
    id: c.id,
    name: (c.name as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    phone: (c.phone as string | null) ?? null,
    created: c.created,
    currency: (c.currency as string | null) ?? null,
    invoice_settings: {
      default_payment_method:
        (c.invoice_settings?.default_payment_method as string | null) ?? null,
    },
  }));

  // 2) Optional search filtering for non-email q
  const filtered =
    q && !q.includes("@")
      ? customers.filter((c) => {
          const hay = [
            normalize(c.name),
            normalize(c.email),
            normalize(c.phone),
            normalize(c.id),
          ].join(" ");
          return hay.includes(normalize(q));
        })
      : customers;

  // 3) Load mapping rows for these customers (linked lead)
  const ids = filtered.map((c) => c.id);

  const mappingByCustomer = new Map<
    string,
    { lead_id: string | null; lead_label: string | null }
  >();

  if (ids.length > 0) {
    const { data: mappings } = await sb
      .from("organization_stripe_customers")
      .select("stripe_customer_id, lead_id")
      .eq("org_id", ctx.orgId)
      .eq("livemode", ctx.livemode)
      .in("stripe_customer_id", ids);

    const leadIds = (mappings ?? [])
      .map((m) => m.lead_id as string | null)
      .filter(Boolean) as string[];

    const leadLabelById = new Map<string, string>();

    if (leadIds.length > 0) {
      const { data: leads } = await sb
        .from("leads")
        .select("id, custom_values, stage")
        .in("id", leadIds);

      for (const l of leads ?? []) {
        const cv = (l.custom_values ?? {}) as Record<string, any>;
        const fullName = nonEmptyString(
          `${cv.first_name ?? ""} ${cv.last_name ?? ""}`.trim()
        );

        const guess =
          nonEmptyString(cv.name) ??
          nonEmptyString(cv.full_name) ??
          fullName ??
          nonEmptyString(cv.company) ??
          nonEmptyString(cv.email) ??
          `Lead (${(l.stage as string | null) ?? "Pipeline"})`;

        leadLabelById.set(l.id as string, String(guess));
      }
    }

    for (const m of mappings ?? []) {
      const stripe_customer_id = m.stripe_customer_id as string;
      const lead_id = (m.lead_id as string | null) ?? null;

      mappingByCustomer.set(stripe_customer_id, {
        lead_id,
        lead_label: lead_id ? leadLabelById.get(lead_id) ?? "Linked lead" : null,
      });
    }
  }

  // 4) Attach mapping info to each row
  const rows = filtered.map((c) => {
    const mapped = mappingByCustomer.get(c.id);
    return {
      ...c,
      linkedLeadId: mapped?.lead_id ?? null,
      linkedLeadLabel: mapped?.lead_label ?? null,
    };
  });

  return NextResponse.json({
    customers: rows,
    stripeAccountId: ctx.stripeAccountId,
    livemode: ctx.livemode,
    q,
  });
}
