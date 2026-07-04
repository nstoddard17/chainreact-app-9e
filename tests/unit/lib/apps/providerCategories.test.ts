/**
 * Coverage guard for the Apps-page provider category/description maps
 * (surfaced by the ASANA-1 Apps debug: asana shipped without entries, so
 * its card rendered under "Other" with a blank description).
 *
 * The maps are hand-maintained (the file's own "adding a new provider"
 * step 2). The "Other" fallback stays as a render-safety net, but every
 * REGISTERED provider must be deliberately mapped — mirrors the
 * credentialSharing coverage test's philosophy.
 */
import { listProviders } from "@/integrations/_registry";
import {
  APPS_CATEGORY_ORDER,
  categoryFor,
  descriptionFor,
} from "@/lib/apps/providerCategories";

describe("providerCategories coverage", () => {
  it("every registered provider has an EXPLICIT category (no silent 'Other' fallback)", () => {
    const unmapped = listProviders()
      .map((m) => m.id)
      // A provider deliberately categorized as "Other" would need an explicit
      // entry; today none are, so any "Other" result means a missing key.
      .filter((id) => categoryFor(id) === "Other");
    expect(unmapped).toEqual([]);
  });

  it("every registered provider has a non-empty description", () => {
    const missing = listProviders()
      .map((m) => m.id)
      .filter((id) => descriptionFor(id).trim().length === 0);
    expect(missing).toEqual([]);
  });

  it("every mapped category is a member of APPS_CATEGORY_ORDER", () => {
    for (const m of listProviders()) {
      expect(APPS_CATEGORY_ORDER).toContain(categoryFor(m.id));
    }
  });

  it("asana maps to Productivity with a task-centric description", () => {
    expect(categoryFor("asana")).toBe("Productivity");
    expect(descriptionFor("asana")).toMatch(/task/i);
  });
});
