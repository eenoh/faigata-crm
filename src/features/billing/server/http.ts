import { NextResponse } from "next/server";
import type { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";

type BillingAuthFailure = Exclude<
  Awaited<ReturnType<typeof getAuthedBillingContextWithReason>>,
  { ok: true; ctx: unknown }
>;

export function billingContextErrorResponse(result: BillingAuthFailure) {
  switch (result.reason) {
    case "no_user":
      return NextResponse.json(
        {
          error: "unauthorized",
          message: "Invalid session or user not found.",
        },
        { status: 401 },
      );
    case "missing_privilege":
      return NextResponse.json(
        {
          error: "forbidden",
          message: "You do not have permission to access this billing route.",
          details: result.details,
        },
        { status: 403 },
      );
    case "missing_org":
      return NextResponse.json(
        {
          error: "missing_org_id",
          message: "No organization is linked to the resolved team.",
          details: result.details,
        },
        { status: 400 },
      );
    case "missing_stripe_account":
      return NextResponse.json(
        {
          error: "missing_stripe_account_id",
          message:
            "No connected Stripe account found for this org in the selected mode.",
          details: result.details,
        },
        { status: 400 },
      );
    case "profile_missing":
      return NextResponse.json(
        {
          error: "profile_missing",
          message: "Could not load the current billing profile.",
          details: result.details,
        },
        { status: 403 },
      );
    default:
      return NextResponse.json(
        {
          error: "billing_context_failed",
          message: "Failed to resolve billing context.",
          details: result.details,
        },
        { status: 500 },
      );
  }
}
