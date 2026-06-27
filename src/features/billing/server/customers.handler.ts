import { NextResponse } from "next/server";
import { applyEntityTranslations } from "@/features/crm/server/custom-value-translations";
import { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";
import { billingContextErrorResponse } from "@/features/billing/server/http";
import { applyBillingCustomerNameTranslations } from "@/features/billing/server/translations";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { getStripeClientForLivemode } from "@/lib/stripe/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

type LeadLabelRow = {
  id: string;
  lead_name: string | null;
  primary_contact_value: string | null;
  custom_values: Record<string, unknown> | null;
  stage: string | null;
  stage_id: string | null;
};

type StageTranslationRow = {
  id: string;
  name: string;
};

export async function GET(request: Request) {
  const billing = await getAuthedBillingContextWithReason(request);
  if (!billing.ok) {
    return billingContextErrorResponse(billing);
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50),
  );

  try {
    const stripe = getStripeClientForLivemode(billing.ctx.livemode);
    const supabase = getSupabaseAdminClient();
    const requestedLocale = await resolveRequestLocale({
      request,
      admin: supabase,
      userId: billing.ctx.userId,
    });

    const list = await stripe.customers.list(
      { limit, ...(q.includes("@") ? { email: q } : {}) },
      { stripeAccount: billing.ctx.stripeAccountId },
    );

    const customers = list.data.map((customer) => ({
      id: customer.id,
      name: customer.name ?? null,
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      created: customer.created,
      currency: customer.currency ?? null,
      invoice_settings: {
        default_payment_method:
          (customer.invoice_settings?.default_payment_method as string | null) ??
          null,
      },
    }));

    const customerTranslationRows = customers.map((customer) => ({
      customerId: customer.id,
      name: customer.name,
    }));

    await applyBillingCustomerNameTranslations({
      admin: supabase,
      orgId: billing.ctx.orgId,
      livemode: billing.ctx.livemode,
      requestedLocale,
      rows: customerTranslationRows,
    });

    for (const [index, customer] of customers.entries()) {
      const translated = customerTranslationRows[index];
      if (translated) {
        customer.name = translated.name;
      }
    }

    const filtered =
      q && !q.includes("@")
        ? customers.filter((customer) => {
            const haystack = [
              normalize(customer.name),
              normalize(customer.email),
              normalize(customer.phone),
              normalize(customer.id),
            ].join(" ");

            return haystack.includes(normalize(q));
          })
        : customers;

    const ids = filtered.map((customer) => customer.id);
    const mappingByCustomer = new Map<
      string,
      { lead_id: string | null; lead_label: string | null }
    >();

    if (ids.length > 0) {
      const { data: mappings } = await supabase
        .from("organization_stripe_customers")
        .select("stripe_customer_id, lead_id")
        .eq("org_id", billing.ctx.orgId)
        .eq("livemode", billing.ctx.livemode)
        .in("stripe_customer_id", ids);

      const leadIds = (mappings ?? [])
        .map((mapping) => mapping.lead_id as string | null)
        .filter(Boolean) as string[];

      const leadLabelById = new Map<string, string>();
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from("leads")
          .select(
            "id, lead_name, primary_contact_value, custom_values, stage, stage_id",
          )
          .in("id", leadIds);

        const safeLeads = (Array.isArray(leads) ? leads : []) as LeadLabelRow[];

        await applyEntityTranslations({
          admin: supabase as any,
          teamId: billing.ctx.teamId,
          entityTable: "leads",
          rows: safeLeads,
          requestedLocale,
          fields: [
            {
              fieldKey: "lead_name",
              sourceText: (row) => row.lead_name ?? "",
              assign: (row, value) => {
                row.lead_name = value;
              },
            },
          ],
        });

        const stageIds = Array.from(
          new Set(
            safeLeads
              .map((lead) =>
                typeof lead.stage_id === "string" ? lead.stage_id.trim() : "",
              )
              .filter(Boolean),
          ),
        );

        const stageNameById = new Map<string, string>();
        if (stageIds.length > 0) {
          const { data: stageData } = await supabase
            .from("pipeline_stages")
            .select("id, name")
            .eq("team_id", billing.ctx.teamId)
            .in("id", stageIds);

          const safeStages = (Array.isArray(stageData)
            ? stageData
            : []) as StageTranslationRow[];

          await applyEntityTranslations({
            admin: supabase as any,
            teamId: billing.ctx.teamId,
            entityTable: "pipeline_stages",
            rows: safeStages,
            requestedLocale,
            fields: [
              {
                fieldKey: "name",
                sourceText: (row) => row.name,
                assign: (row, value) => {
                  row.name = value;
                },
              },
            ],
          });

          for (const stage of safeStages) {
            stageNameById.set(stage.id, stage.name);
          }
        }

        for (const lead of safeLeads) {
          const customValues = (lead.custom_values ?? {}) as Record<
            string,
            unknown
          >;
          const fullName = nonEmptyString(
            `${customValues.first_name ?? ""} ${customValues.last_name ?? ""}`.trim(),
          );
          const translatedStageName =
            typeof lead.stage_id === "string"
              ? (stageNameById.get(lead.stage_id) ?? null)
              : null;

          const guess =
            nonEmptyString(lead.lead_name) ??
            nonEmptyString(customValues.name) ??
            nonEmptyString(customValues.full_name) ??
            fullName ??
            nonEmptyString(customValues.company) ??
            nonEmptyString(lead.primary_contact_value) ??
            nonEmptyString(customValues.email) ??
            `Lead (${translatedStageName ?? lead.stage ?? "Pipeline"})`;

          leadLabelById.set(lead.id, String(guess));
        }
      }

      for (const mapping of mappings ?? []) {
        const stripeCustomerId = mapping.stripe_customer_id as string;
        const leadId = (mapping.lead_id as string | null) ?? null;

        mappingByCustomer.set(stripeCustomerId, {
          lead_id: leadId,
          lead_label: leadId ? (leadLabelById.get(leadId) ?? "Linked lead") : null,
        });
      }
    }

    return NextResponse.json({
      customers: filtered.map((customer) => {
        const mapped = mappingByCustomer.get(customer.id);
        return {
          ...customer,
          linkedLeadId: mapped?.lead_id ?? null,
          linkedLeadLabel: mapped?.lead_label ?? null,
        };
      }),
      stripeAccountId: billing.ctx.stripeAccountId,
      livemode: billing.ctx.livemode,
      q,
      limit,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "customers_list_failed",
        message: String(error?.message ?? error),
      },
      { status: 500 },
    );
  }
}
