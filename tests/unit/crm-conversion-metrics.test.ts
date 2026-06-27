import { describe, expect, it } from "vitest";

import {
  buildConversionMetricLabel,
  createOnboardingStageDraft,
  findStageNameById,
} from "@/features/crm/utils/conversionMetrics";

describe("CRM conversion metric helpers", () => {
  it("builds fallback labels from display names", () => {
    expect(buildConversionMetricLabel("New", "Qualified")).toBe(
      "New -> Qualified",
    );
    expect(buildConversionMetricLabel("New", "")).toBe("New ->");
    expect(buildConversionMetricLabel("", "Qualified")).toBe("-> Qualified");
  });

  it("resolves stage names from stable ids", () => {
    expect(
      findStageNameById(
        [
          { id: "stage-1", name: "New" },
          { id: "stage-2", name: "Qualified" },
        ],
        "stage-2",
      ),
    ).toBe("Qualified");
    expect(findStageNameById([], "missing")).toBe("");
  });

  it("creates predictable onboarding stage drafts", () => {
    expect(createOnboardingStageDraft("Booked call", 2)).toEqual({
      clientId: "stage-3",
      name: "Booked call",
    });
  });
});
