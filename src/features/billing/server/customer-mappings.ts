import "server-only";

const BILLING_CUSTOMER_TABLE = "organization_stripe_customers";

type BillingCustomerMappingRow = {
  org_id: string;
  livemode: boolean;
  stripe_customer_id: string;
  lead_id: string | null;
  created_at?: string;
  updated_at: string;
};

type BillingCustomerMappingLookup = {
  stripe_customer_id?: string | null;
  lead_id?: string | null;
} | null;

type StoreResult<T> = Promise<{ data: T; error: any }>;
type WriteResult = Promise<{ error: any }>;

export type BillingCustomerMappingStore = {
  findByStripeCustomerId(args: {
    orgId: string;
    livemode: boolean;
    stripeCustomerId: string;
  }): StoreResult<BillingCustomerMappingLookup>;
  findByLeadId(args: {
    orgId: string;
    livemode: boolean;
    leadId: string;
  }): StoreResult<BillingCustomerMappingLookup>;
  updateByStripeCustomerId(args: {
    orgId: string;
    livemode: boolean;
    stripeCustomerId: string;
    values: Partial<BillingCustomerMappingRow>;
  }): WriteResult;
  updateByLeadId(args: {
    orgId: string;
    livemode: boolean;
    leadId: string;
    values: Partial<BillingCustomerMappingRow>;
  }): WriteResult;
  insert(row: BillingCustomerMappingRow): WriteResult;
};

function isNoRowError(error: any) {
  if (!error) {
    return true;
  }

  return error.code === "PGRST116";
}

export function createSupabaseBillingCustomerMappingStore(admin: any): BillingCustomerMappingStore {
  return {
    findByStripeCustomerId({ orgId, livemode, stripeCustomerId }) {
      return admin
        .from(BILLING_CUSTOMER_TABLE)
        .select("stripe_customer_id, lead_id")
        .eq("org_id", orgId)
        .eq("livemode", livemode)
        .eq("stripe_customer_id", stripeCustomerId)
        .maybeSingle();
    },
    findByLeadId({ orgId, livemode, leadId }) {
      return admin
        .from(BILLING_CUSTOMER_TABLE)
        .select("stripe_customer_id, lead_id")
        .eq("org_id", orgId)
        .eq("livemode", livemode)
        .eq("lead_id", leadId)
        .maybeSingle();
    },
    updateByStripeCustomerId({ orgId, livemode, stripeCustomerId, values }) {
      return admin
        .from(BILLING_CUSTOMER_TABLE)
        .update(values)
        .eq("org_id", orgId)
        .eq("livemode", livemode)
        .eq("stripe_customer_id", stripeCustomerId);
    },
    updateByLeadId({ orgId, livemode, leadId, values }) {
      return admin
        .from(BILLING_CUSTOMER_TABLE)
        .update(values)
        .eq("org_id", orgId)
        .eq("livemode", livemode)
        .eq("lead_id", leadId);
    },
    insert(row) {
      return admin.from(BILLING_CUSTOMER_TABLE).insert(row);
    },
  };
}

export async function saveBillingCustomerMapping(
  store: BillingCustomerMappingStore,
  args: {
    orgId: string;
    livemode: boolean;
    stripeCustomerId: string;
    leadId: string | null;
    now?: string;
  },
) {
  const now = args.now ?? new Date().toISOString();
  const baseValues = {
    lead_id: args.leadId,
    updated_at: now,
  };

  const existingByCustomer = await store.findByStripeCustomerId({
    orgId: args.orgId,
    livemode: args.livemode,
    stripeCustomerId: args.stripeCustomerId,
  });

  if (!isNoRowError(existingByCustomer.error)) {
    return { error: existingByCustomer.error };
  }

  if (existingByCustomer.data) {
    const result = await store.updateByStripeCustomerId({
      orgId: args.orgId,
      livemode: args.livemode,
      stripeCustomerId: args.stripeCustomerId,
      values: baseValues,
    });

    return { error: result.error };
  }

  if (args.leadId) {
    const existingByLead = await store.findByLeadId({
      orgId: args.orgId,
      livemode: args.livemode,
      leadId: args.leadId,
    });

    if (!isNoRowError(existingByLead.error)) {
      return { error: existingByLead.error };
    }

    if (existingByLead.data) {
      const result = await store.updateByLeadId({
        orgId: args.orgId,
        livemode: args.livemode,
        leadId: args.leadId,
        values: {
          stripe_customer_id: args.stripeCustomerId,
          ...baseValues,
        },
      });

      return { error: result.error };
    }
  }

  const insertRow: BillingCustomerMappingRow = {
    org_id: args.orgId,
    livemode: args.livemode,
    stripe_customer_id: args.stripeCustomerId,
    lead_id: args.leadId,
    created_at: now,
    updated_at: now,
  };

  const inserted = await store.insert(insertRow);
  if (!inserted.error) {
    return { error: null };
  }

  if (inserted.error?.code === "23505") {
    const retryByCustomer = await store.updateByStripeCustomerId({
      orgId: args.orgId,
      livemode: args.livemode,
      stripeCustomerId: args.stripeCustomerId,
      values: baseValues,
    });

    if (!retryByCustomer.error) {
      return { error: null };
    }

    if (args.leadId) {
      const retryByLead = await store.updateByLeadId({
        orgId: args.orgId,
        livemode: args.livemode,
        leadId: args.leadId,
        values: {
          stripe_customer_id: args.stripeCustomerId,
          ...baseValues,
        },
      });

      if (!retryByLead.error) {
        return { error: null };
      }
    }
  }

  return { error: inserted.error };
}

export async function clearBillingCustomerLeadLink(
  store: BillingCustomerMappingStore,
  args: {
    orgId: string;
    livemode: boolean;
    stripeCustomerId: string;
    now?: string;
  },
) {
  const result = await store.updateByStripeCustomerId({
    orgId: args.orgId,
    livemode: args.livemode,
    stripeCustomerId: args.stripeCustomerId,
    values: {
      lead_id: null,
      updated_at: args.now ?? new Date().toISOString(),
    },
  });

  return { error: result.error };
}
