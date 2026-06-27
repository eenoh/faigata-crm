import { describe, expect, it } from "vitest";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  getBillingErrorMessage,
} from "@/features/billing/components/errorMessages";

describe("billing error messages", () => {
  it("prefers a human-readable message from the API", () => {
    expect(
      getBillingErrorMessage(
        {
          error: "refund_failed",
          message: "This payment has already been fully refunded.",
        },
        "Fallback message",
      ),
    ).toBe("This payment has already been fully refunded.");
  });

  it("maps known session codes to a user-facing instruction", () => {
    expect(getBillingErrorMessage("no_session", "Fallback message")).toBe(
      BILLING_SESSION_EXPIRED_MESSAGE,
    );
  });

  it("turns status-shaped fallback codes into clearer copy", () => {
    expect(getBillingErrorMessage("failed_503", "Fallback message")).toBe(
      "We couldn't reach Stripe right now. Please try again in a moment.",
    );
  });
});
