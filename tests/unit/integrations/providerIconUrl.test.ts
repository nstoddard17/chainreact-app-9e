/**
 * Tests for integrations/_registry:providerIconUrl.
 *
 * Slice 4.BUILDER-INSPECTOR-1: the registry exposes a tiny helper that
 * derives `/integrations/{providerId}.svg` from a provider id. The
 * Builder UI consumes this through ProviderOption.iconUrl → adapter
 * context → WorkflowNodeData.providerIcon → WorkflowNodeCard avatar.
 *
 * Contract verified here:
 *   - Returns the expected `/integrations/{id}.svg` URL for known providers.
 *   - Returns `undefined` for unknown providers (the avatar then falls
 *     back to its initials path without rendering a broken <img>).
 *   - No per-provider branches — the helper works for every manifest
 *     loaded into the registry, sampled across providers below.
 */
import {
  providerIconUrl,
  listProviders,
} from "@/integrations/_registry";

describe("providerIconUrl", () => {
  it("returns the conventional /integrations/{id}.svg path for known providers", () => {
    // Sample across a spread of namespaces (single-segment + microsoft- / google- families).
    expect(providerIconUrl("slack")).toBe("/integrations/slack.svg");
    expect(providerIconUrl("gmail")).toBe("/integrations/gmail.svg");
    expect(providerIconUrl("google-calendar")).toBe(
      "/integrations/google-calendar.svg",
    );
    expect(providerIconUrl("microsoft-onedrive")).toBe(
      "/integrations/microsoft-onedrive.svg",
    );
    expect(providerIconUrl("microsoft-outlook-calendar")).toBe(
      "/integrations/microsoft-outlook-calendar.svg",
    );
    expect(providerIconUrl("stripe")).toBe("/integrations/stripe.svg");
    expect(providerIconUrl("trello")).toBe("/integrations/trello.svg");
  });

  it("returns undefined for unknown provider ids", () => {
    expect(providerIconUrl("does-not-exist")).toBeUndefined();
    expect(providerIconUrl("")).toBeUndefined();
  });

  it("every manifest in the registry resolves to an icon URL", () => {
    // The Builder UI assumes every known provider has a resolvable URL
    // (the actual SVG file may or may not exist — WorkflowNodeCard falls
    // back via <img onError> if missing). This test pins that contract:
    // adding a new manifest must not silently return undefined here.
    for (const p of listProviders()) {
      expect(providerIconUrl(p.id)).toBe(`/integrations/${p.id}.svg`);
    }
  });
});
