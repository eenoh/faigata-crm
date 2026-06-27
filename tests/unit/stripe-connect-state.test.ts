import { describe, expect, it } from "vitest";
import {
  decodeStripeConnectState,
  encodeStripeConnectState,
} from "@/features/integrations/stripe/server/connect-state";

describe("Stripe connect state", () => {
  it("round-trips a valid payload", () => {
    const secret = "test-stripe-connect-secret";
    const encoded = encodeStripeConnectState(
      {
        orgId: "org_123",
        userId: "user_123",
        nonce: "nonce_123",
        ts: 123456789,
        livemode: false,
      },
      secret,
    );

    expect(decodeStripeConnectState(encoded, secret)).toEqual({
      orgId: "org_123",
      userId: "user_123",
      nonce: "nonce_123",
      ts: 123456789,
      livemode: false,
    });
  });

  it("rejects malformed payloads", () => {
    expect(
      decodeStripeConnectState("not-valid", "test-stripe-connect-secret"),
    ).toBeNull();
  });

  it("rejects tampered payloads", () => {
    const secret = "test-stripe-connect-secret";
    const encoded = encodeStripeConnectState(
      {
        orgId: "org_123",
        userId: "user_123",
        nonce: "nonce_123",
        ts: 123456789,
        livemode: false,
      },
      secret,
    );

    const raw = Buffer.from(encoded, "base64url").toString("utf8");
    const tampered = Buffer.from(
      raw.replace('"orgId":"org_123"', '"orgId":"org_456"'),
    ).toString("base64url");

    expect(decodeStripeConnectState(tampered, secret)).toBeNull();
  });
});
