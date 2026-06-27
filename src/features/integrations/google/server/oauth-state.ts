import "server-only";

import crypto from "crypto";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env/shared";

const GOOGLE_OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;

type GoogleOauthStatePayload = {
  uid: string;
  nonce: string;
  ts: number;
  sig: string;
};

function getGoogleOauthStateSecret() {
  return (
    getOptionalEnv("GOOGLE_OAUTH_STATE_SECRET") ||
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

function signGoogleOauthState(uid: string, nonce: string, ts: number) {
  return crypto
    .createHmac("sha256", getGoogleOauthStateSecret())
    .update(`${uid}.${nonce}.${ts}`)
    .digest("hex");
}

function encodeGoogleOauthState(payload: GoogleOauthStatePayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeGoogleOauthState(state: string) {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as
      | GoogleOauthStatePayload
      | null;
  } catch {
    return null;
  }
}

function timingSafeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

export function createGoogleOauthState(userId: string, now = Date.now()) {
  const nonce = crypto.randomUUID();

  return encodeGoogleOauthState({
    uid: userId,
    nonce,
    ts: now,
    sig: signGoogleOauthState(userId, nonce, now),
  });
}

export function resolveGoogleOauthUserId(args: {
  returnedState: string | null;
  cookieState: string | null;
  cookieUserId: string | null;
  now?: number;
}) {
  if (args.cookieState && args.cookieUserId) {
    if (!args.returnedState || args.returnedState !== args.cookieState) return null;
    return args.cookieUserId;
  }

  if (!args.returnedState) return null;

  const raw = decodeGoogleOauthState(args.returnedState);
  if (!raw) return null;

  const uid = typeof raw.uid === "string" ? raw.uid.trim() : "";
  const nonce = typeof raw.nonce === "string" ? raw.nonce.trim() : "";
  const ts = Number(raw.ts);
  const sig = typeof raw.sig === "string" ? raw.sig.trim() : "";

  if (!uid || !nonce || !Number.isFinite(ts) || !sig) return null;

  if ((args.now ?? Date.now()) - ts > GOOGLE_OAUTH_STATE_MAX_AGE_MS) {
    return null;
  }

  const expected = signGoogleOauthState(uid, nonce, ts);
  if (!timingSafeEqualString(sig, expected)) return null;

  return uid;
}
