import "server-only";

import crypto from "crypto";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env/shared";
import { isRecord } from "@/lib/validation/primitives";

export type StripeConnectState = {
  orgId: string;
  userId: string;
  nonce: string;
  ts: number;
  livemode: boolean;
};

type EncodedStripeConnectState = StripeConnectState & {
  sig: string;
};

function getStripeConnectStateSecret() {
  return (
    getOptionalEnv("STRIPE_CONNECT_STATE_SECRET") ||
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

function signStripeConnectState(
  payload: StripeConnectState,
  secret: string,
) {
  return crypto
    .createHmac("sha256", secret)
    .update(
      `${payload.orgId}.${payload.userId}.${payload.nonce}.${payload.ts}.${payload.livemode ? "1" : "0"}`,
    )
    .digest("hex");
}

function timingSafeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

export function encodeStripeConnectState(
  payload: StripeConnectState,
  secret = getStripeConnectStateSecret(),
) {
  const encodedPayload: EncodedStripeConnectState = {
    ...payload,
    sig: signStripeConnectState(payload, secret),
  };

  return Buffer.from(JSON.stringify(encodedPayload)).toString("base64url");
}

export function decodeStripeConnectState(
  state: string,
  secret = getStripeConnectStateSecret(),
): StripeConnectState | null {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));

    if (!isRecord(parsed)) return null;
    if (typeof parsed.orgId !== "string") return null;
    if (typeof parsed.userId !== "string") return null;
    if (typeof parsed.nonce !== "string") return null;
    if (typeof parsed.ts !== "number") return null;
    if (typeof parsed.sig !== "string") return null;

    const payload: StripeConnectState = {
      orgId: parsed.orgId,
      userId: parsed.userId,
      nonce: parsed.nonce,
      ts: parsed.ts,
      livemode: Boolean(parsed.livemode),
    };

    const expected = signStripeConnectState(payload, secret);
    if (!timingSafeEqualString(parsed.sig, expected)) return null;

    return payload;
  } catch {
    return null;
  }
}
