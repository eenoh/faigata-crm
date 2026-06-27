import { describe, expect, it } from "vitest";
import {
  buildLeadNicheOptions,
  canTeamSelectNiche,
  findDuplicateNiche,
  groupCatalogNiches,
  normalizeNicheName,
  toNormalizedNicheName,
  type NicheRecord,
} from "@/features/crm/server/niches.shared";

const GLOBAL: NicheRecord = {
  id: "global-1",
  name: "SaaS",
  normalized_name: "saas",
  scope: "global",
  organization_id: null,
  visibility: "public",
};

const OWN_PRIVATE: NicheRecord = {
  id: "own-1",
  name: "Local Law Firms",
  normalized_name: "local law firms",
  scope: "organization",
  organization_id: "org-a",
  visibility: "private",
};

const OWN_PUBLIC: NicheRecord = {
  id: "own-2",
  name: "Dental Clinics",
  normalized_name: "dental clinics",
  scope: "organization",
  organization_id: "org-a",
  visibility: "public",
};

const OTHER_PUBLIC: NicheRecord = {
  id: "other-1",
  name: "Roofing",
  normalized_name: "roofing",
  scope: "organization",
  organization_id: "org-b",
  visibility: "public",
  organization_name: "Bluebird Agency",
};

const OTHER_PRIVATE: NicheRecord = {
  id: "other-2",
  name: "Secret Niche",
  normalized_name: "secret niche",
  scope: "organization",
  organization_id: "org-b",
  visibility: "private",
};

describe("niche helpers", () => {
  it("normalizes niche names for duplicate matching", () => {
    expect(normalizeNicheName("  Local   Law   Firms ")).toBe("Local Law Firms");
    expect(toNormalizedNicheName("  Local   Law   Firms ")).toBe("local law firms");
  });

  it("groups global, own org, and public reusable niches separately", () => {
    const grouped = groupCatalogNiches(
      [GLOBAL, OWN_PRIVATE, OWN_PUBLIC, OTHER_PUBLIC, OTHER_PRIVATE],
      "org-a",
    );

    expect(grouped.global.map((row) => row.id)).toEqual(["global-1"]);
    expect(grouped.organization.map((row) => row.id)).toEqual(["own-2", "own-1"]);
    expect(grouped["public-other"].map((row) => row.id)).toEqual(["other-1"]);
  });

  it("rejects private niches from other organizations", () => {
    expect(canTeamSelectNiche(OTHER_PRIVATE, "org-a")).toBe(false);
    expect(canTeamSelectNiche(OTHER_PUBLIC, "org-a")).toBe(true);
    expect(canTeamSelectNiche(OWN_PRIVATE, "org-a")).toBe(true);
  });

  it("detects duplicates against global, own org, and public reusable catalogs", () => {
    const catalog = [GLOBAL, OWN_PRIVATE, OTHER_PUBLIC];

    expect(findDuplicateNiche(catalog, "saas", "org-a")?.id).toBe("global-1");
    expect(findDuplicateNiche(catalog, "local law firms", "org-a")?.id).toBe("own-1");
    expect(findDuplicateNiche(catalog, "roofing", "org-a")?.id).toBe("other-1");
    expect(findDuplicateNiche(catalog, "med spas", "org-a")).toBeNull();
  });

  it("builds lead-form options and keeps archived selections available", () => {
    const options = buildLeadNicheOptions({
      enabled: [GLOBAL, OWN_PRIVATE, OTHER_PUBLIC],
      currentOrganizationId: "org-a",
      archived: {
        id: "archived-1",
        name: "Old Vertical",
        normalized_name: "old vertical",
        scope: "organization",
        organization_id: "org-a",
        visibility: "private",
      },
    });

    expect(options[0]).toMatchObject({
      id: "archived-1",
      archived: true,
      description: "Archived / no longer enabled",
    });
    expect(options.some((option) => option.id === "global-1")).toBe(true);
    expect(options.some((option) => option.id === "own-1")).toBe(true);
    expect(options.some((option) => option.id === "other-1")).toBe(true);
  });
});
