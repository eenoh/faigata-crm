import { beforeEach, describe, expect, it, vi } from "vitest";

const constructEventMock = vi.fn();

vi.mock("stripe", () => ({
  default: {
    webhooks: {
      constructEvent: constructEventMock,
    },
  },
}));

describe("verifyPlatformStripeWebhook", () => {
  beforeEach(() => {
    constructEventMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_primary";
    delete process.env.STRIPE_PLATFORM_WEBHOOK_SECRET_TEST;
    delete process.env.STRIPE_PLATFORM_WEBHOOK_SECRET_LIVE;
  });

  it("uses the configured platform webhook secret", async () => {
    constructEventMock.mockReturnValue({ id: "evt_123", livemode: false });

    const { verifyPlatformStripeWebhook } = await import(
      "@/lib/stripe/webhooks"
    );

    const payload = Buffer.from("{}");
    const event = verifyPlatformStripeWebhook(payload, "sig_123");

    expect(event).toEqual({ id: "evt_123", livemode: false });
    expect(constructEventMock).toHaveBeenCalledWith(
      payload,
      "sig_123",
      "whsec_primary",
    );
  });

  it("throws when no platform webhook secret is configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const { verifyPlatformStripeWebhook } = await import(
      "@/lib/stripe/webhooks"
    );

    expect(() =>
      verifyPlatformStripeWebhook(Buffer.from("{}"), "sig_123"),
    ).toThrow("missing_platform_webhook_secret");
  });
});
