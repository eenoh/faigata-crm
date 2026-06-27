import { describe, expect, it, vi } from "vitest";
import {
  clearBillingCustomerLeadLink,
  saveBillingCustomerMapping,
  type BillingCustomerMappingStore,
} from "@/features/billing/server/customer-mappings";

function createStore(
  overrides: Partial<BillingCustomerMappingStore> = {},
): BillingCustomerMappingStore {
  return {
    findByStripeCustomerId: vi.fn().mockResolvedValue({ data: null, error: null }),
    findByLeadId: vi.fn().mockResolvedValue({ data: null, error: null }),
    updateByStripeCustomerId: vi.fn().mockResolvedValue({ error: null }),
    updateByLeadId: vi.fn().mockResolvedValue({ error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

describe("saveBillingCustomerMapping", () => {
  it("inserts a new mapping with timestamps when no mapping exists", async () => {
    const store = createStore();

    const result = await saveBillingCustomerMapping(store, {
      orgId: "org-1",
      livemode: false,
      stripeCustomerId: "cus_123",
      leadId: "lead-1",
      now: "2026-06-26T12:00:00.000Z",
    });

    expect(result).toEqual({ error: null });
    expect(store.insert).toHaveBeenCalledWith({
      org_id: "org-1",
      livemode: false,
      stripe_customer_id: "cus_123",
      lead_id: "lead-1",
      created_at: "2026-06-26T12:00:00.000Z",
      updated_at: "2026-06-26T12:00:00.000Z",
    });
  });

  it("reuses an existing lead mapping instead of inserting a duplicate row", async () => {
    const store = createStore({
      findByLeadId: vi.fn().mockResolvedValue({
        data: { stripe_customer_id: "cus_old", lead_id: "lead-1" },
        error: null,
      }),
    });

    const result = await saveBillingCustomerMapping(store, {
      orgId: "org-1",
      livemode: false,
      stripeCustomerId: "cus_new",
      leadId: "lead-1",
      now: "2026-06-26T12:00:00.000Z",
    });

    expect(result).toEqual({ error: null });
    expect(store.updateByLeadId).toHaveBeenCalledWith({
      orgId: "org-1",
      livemode: false,
      leadId: "lead-1",
      values: {
        stripe_customer_id: "cus_new",
        lead_id: "lead-1",
        updated_at: "2026-06-26T12:00:00.000Z",
      },
    });
    expect(store.insert).not.toHaveBeenCalled();
  });
});

describe("clearBillingCustomerLeadLink", () => {
  it("clears the linked lead for an existing Stripe customer mapping", async () => {
    const store = createStore();

    const result = await clearBillingCustomerLeadLink(store, {
      orgId: "org-1",
      livemode: false,
      stripeCustomerId: "cus_123",
      now: "2026-06-26T12:00:00.000Z",
    });

    expect(result).toEqual({ error: null });
    expect(store.updateByStripeCustomerId).toHaveBeenCalledWith({
      orgId: "org-1",
      livemode: false,
      stripeCustomerId: "cus_123",
      values: {
        lead_id: null,
        updated_at: "2026-06-26T12:00:00.000Z",
      },
    });
  });
});
