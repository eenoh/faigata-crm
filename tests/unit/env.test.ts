import { beforeEach, describe, expect, it } from "vitest";
import { getBooleanEnv } from "@/lib/env/shared";

describe("getBooleanEnv", () => {
  beforeEach(() => {
    delete process.env.FEATURE_FLAG;
  });

  it("returns the fallback when the variable is unset", () => {
    expect(getBooleanEnv("FEATURE_FLAG", true)).toBe(true);
  });

  it("parses truthy values", () => {
    process.env.FEATURE_FLAG = "true";
    expect(getBooleanEnv("FEATURE_FLAG")).toBe(true);
  });

  it("parses falsy values", () => {
    process.env.FEATURE_FLAG = "0";
    expect(getBooleanEnv("FEATURE_FLAG", true)).toBe(false);
  });
});
