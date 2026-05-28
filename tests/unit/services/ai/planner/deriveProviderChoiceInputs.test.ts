/**
 * @jest-environment node
 *
 * Slice 4.AI-35 — deterministic provider-choice derivation.
 *
 * Pins: an ambiguous generic-category request ("email") with ≥2 catalog
 * providers and none named → a structured `provider_choice` entry with
 * options; naming a provider resolves it (no entry); a single-provider
 * category is not ambiguous; explicit non-ambiguous prompts produce nothing.
 */
import { deriveProviderChoiceInputs } from "@/services/ai/planner/deriveProviderChoiceInputs";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

function prov(id: string): ProviderCatalogEntry {
  return {
    id,
    displayName: id,
    capabilities: { oauth: true, webhookTrigger: true, pollingTrigger: false, actions: true },
    isEnabled: true,
    isExperimental: false,
    hasMetadata: true,
    actions: [],
    triggers: [],
  };
}

function catalog(ids: string[]): ProviderCatalogView {
  return { providers: ids.map(prov) };
}

const FULL = catalog([
  "gmail",
  "microsoft-outlook",
  "google-calendar",
  "microsoft-outlook-calendar",
  "google-drive",
  "microsoft-onedrive",
  "dropbox",
  "slack",
  "discord",
]);

describe("deriveProviderChoiceInputs — email ambiguity", () => {
  it("produces a provider_choice with Gmail + Outlook options for a generic 'email' request", () => {
    const out = deriveProviderChoiceInputs("When I get an email send a Slack message", FULL);
    expect(out).toHaveLength(1);
    const entry = out[0]!;
    expect(entry.kind).toBe("provider_choice");
    expect(entry.category).toBe("email");
    expect(entry.options).toEqual([
      { label: "Gmail", value: "gmail" },
      { label: "Microsoft Outlook", value: "microsoft-outlook" },
    ]);
    expect(entry.allowFreeText).toBe(false);
  });

  it("does NOT ask when the user named Gmail explicitly", () => {
    expect(deriveProviderChoiceInputs("When I get a Gmail email send a Slack message", FULL)).toEqual([]);
  });

  it("does NOT ask when the user named Outlook explicitly", () => {
    expect(deriveProviderChoiceInputs("When I get an Outlook email send a Slack message", FULL)).toEqual([]);
  });

  it("does NOT ask when only one email provider is in the catalog (not ambiguous)", () => {
    expect(deriveProviderChoiceInputs("When I get an email send a Slack message", catalog(["gmail", "slack"]))).toEqual([]);
  });
});

describe("deriveProviderChoiceInputs — other categories + safety", () => {
  it("asks for a calendar provider on a generic 'calendar event' request", () => {
    const out = deriveProviderChoiceInputs("Create a calendar event every Monday", FULL);
    expect(out).toHaveLength(1);
    expect(out[0]!.category).toBe("calendar");
    expect(out[0]!.options?.map((o) => o.value)).toEqual([
      "google-calendar",
      "microsoft-outlook-calendar",
    ]);
  });

  it("does not false-trigger on a request that names a specific provider (Slack)", () => {
    expect(deriveProviderChoiceInputs("Send a Slack message to #general", FULL)).toEqual([]);
  });

  it("returns [] for an empty request", () => {
    expect(deriveProviderChoiceInputs("", FULL)).toEqual([]);
    expect(deriveProviderChoiceInputs("   ", FULL)).toEqual([]);
  });

  it("emits only enum-shaped, value-free option metadata (no raw user text)", () => {
    const out = deriveProviderChoiceInputs("SECRET-PHRASE email arrives", FULL);
    expect(JSON.stringify(out)).not.toContain("SECRET-PHRASE");
  });
});
