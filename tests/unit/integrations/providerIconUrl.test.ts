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
import { existsSync } from "node:fs";
import { join } from "node:path";
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

  it("every ENABLED provider has its icon asset present on disk", () => {
    // Regression guard for the CS-6C icon bug: `providerIconUrl` returns a
    // URL unconditionally without validating the file exists, so a provider
    // shipped without its `public/integrations/{id}.svg` renders a broken
    // <img> (initials fallback) on the Apps page, builder, and node headers.
    // Linear and Eden shipped that way. Every provider a user can actually
    // reach — i.e. `isEnabled` — MUST have a committed icon asset.
    const publicDir = join(process.cwd(), "public", "integrations");
    const missing = listProviders()
      .filter((p) => p.isEnabled)
      .map((p) => p.id)
      .filter((id) => !existsSync(join(publicDir, `${id}.svg`)));
    expect(missing).toEqual([]);
  });
});
