import { describe, expect, it } from "vitest";

import {
  getAttendanceStatusTone,
  getInvoiceStatusTone,
  getPaymentStatusTone,
  normalizeAttendanceStatus,
} from "@/i18n/domain-values";

describe("domain value status helpers", () => {
  it("normalizes unknown attendance statuses to unknown", () => {
    expect(normalizeAttendanceStatus("ATTENDED")).toBe("attended");
    expect(normalizeAttendanceStatus("weird_status")).toBe("unknown");
    expect(normalizeAttendanceStatus(null)).toBe("unknown");
  });

  it("maps payment statuses to shared tones", () => {
    expect(getPaymentStatusTone("succeeded", false)).toContain("emerald");
    expect(getPaymentStatusTone("requires_action", false)).toContain("amber");
    expect(getPaymentStatusTone("requires_payment_method", false)).toContain("rose");
    expect(getPaymentStatusTone("something_new", false)).toContain("slate");
  });

  it("maps invoice statuses to shared tones", () => {
    expect(getInvoiceStatusTone("paid", false)).toContain("emerald");
    expect(getInvoiceStatusTone("open", false)).toContain("indigo");
    expect(getInvoiceStatusTone("uncollectible", false)).toContain("amber");
    expect(getInvoiceStatusTone("void", false)).toContain("rose");
    expect(getInvoiceStatusTone("draft", false)).toContain("slate");
  });

  it("maps attendance statuses to shared tones", () => {
    expect(getAttendanceStatusTone("attended", true)).toContain("emerald");
    expect(getAttendanceStatusTone("no_show", true)).toContain("rose");
    expect(getAttendanceStatusTone("rescheduled", true)).toContain("amber");
    expect(getAttendanceStatusTone("cancelled", true)).toContain("slate");
    expect(getAttendanceStatusTone("other", true)).toContain("slate");
  });
});
