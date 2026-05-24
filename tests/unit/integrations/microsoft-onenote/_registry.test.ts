/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-2 — Microsoft OneNote handler-registry coverage.
 *
 * Pins:
 *   - All 12 V1-manifest-declared action handlers register.
 *   - No duplicates.
 *   - The OAuth dispatcher resolves the OneNote provider.
 *   - The provider manifest registry returns the OneNote manifest.
 */
import {
  getProvider,
  listProviders,
  providerSupports,
} from "@/integrations/_registry";
import { microsoftOneNoteManifest } from "@/integrations/microsoft-onenote/manifest";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

const EXPECTED_ACTION_TYPES = [
  "create_page",
  "create_notebook",
  "create_section",
  "update_page",
  "get_page_content",
  "list_pages",
  "copy_page",
  "delete_page",
  "list_notebooks",
  "list_sections",
  "get_notebook_details",
  "get_section_details",
].sort();

describe("microsoft-onenote handler registry", () => {
  it("registers exactly 12 action handlers (full V1 manifest port)", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "microsoft-onenote",
    );
    expect(handlers).toHaveLength(12);
  });

  it("registers every expected action type", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "microsoft-onenote",
    );
    expect(handlers.map((h) => h.type).sort()).toEqual(EXPECTED_ACTION_TYPES);
  });

  it("registers no duplicate (provider, type) pairs", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "microsoft-onenote",
    );
    const keys = handlers.map((h) => `${h.provider}:${h.type}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("microsoft-onenote provider registry", () => {
  it("returns the OneNote manifest under id 'microsoft-onenote'", () => {
    expect(getProvider("microsoft-onenote")).toBe(microsoftOneNoteManifest);
  });

  it("listProviders includes 'microsoft-onenote'", () => {
    expect(listProviders().some((p) => p.id === "microsoft-onenote")).toBe(
      true,
    );
  });

  it("providerSupports correctly reports OneNote capabilities", () => {
    expect(providerSupports("microsoft-onenote", "oauth")).toBe(true);
    expect(providerSupports("microsoft-onenote", "actions")).toBe(true);
    expect(providerSupports("microsoft-onenote", "webhookTrigger")).toBe(false);
    expect(providerSupports("microsoft-onenote", "pollingTrigger")).toBe(false);
  });
});
