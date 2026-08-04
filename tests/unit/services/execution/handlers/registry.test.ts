/**
 * @jest-environment node
 *
 * Tests for the LOOKUP CONTRACT of services/execution/handlers/_registry.ts.
 *
 * TEST-REDUNDANCY-REMOVAL-1 — this suite used to carry ~41 per-slice
 * handler-PRESENCE tests ("registers the 3 Gmail 2.2 label handlers",
 * "registers all 11 Shopify actions", "does NOT register X"). Those pinned
 * provider inventories from a central file, which is both the wrong home and
 * strictly weaker than an exact-set pin. They now live with their providers as
 * `expect(registered.map(h => h.type).sort()).toEqual([...])`:
 *
 *   gmail / slack / notion / shopify → tests/unit/integrations/<p>/manifest.test.ts
 *     (added or upgraded in this batch)
 *   airtable · discord · dropbox · facebook · github · google-analytics ·
 *   google-docs · google-drive · google-sheets · hubspot · microsoft-excel ·
 *   microsoft-onedrive · microsoft-onenote · microsoft-outlook ·
 *   microsoft-outlook-calendar · microsoft-teams · monday · stripe · trello
 *     → already pinned exactly in their own manifest suites
 *   native → tests/structure/discovery-meta-coverage.test.ts (COVERED_PROVIDERS
 *     bijection) + per-action registration tests
 *
 * An exact-set pin subsumes both halves of what was here: a shipped handler
 * that DISAPPEARS fails it, and an unapproved handler that APPEARS fails it
 * (which is what the old "does NOT register …" assertions did one at a time).
 *
 * What remains below is the part with no other home: the registry's own
 * lookup semantics, which are provider-agnostic.
 */
import { getActionHandler } from "@/services/execution/handlers/_registry";

describe("action handler registry — lookup contract", () => {
  it("returns undefined for a (provider, type) pair that is not registered", () => {
    // find_user_by_email is permanently skipped per Slack 2.3 plan
    // §6 decision 3 (PII scope; V1 orphan). The Slack exact-set pin in
    // tests/unit/integrations/slack/manifest.test.ts is what stops it being
    // added; this asserts the LOOKUP returns undefined rather than throwing
    // or falling back to another provider's handler.
    expect(getActionHandler("slack", "find_user_by_email")).toBeUndefined();
  });

  it("the lookup namespace is (provider, type) — same type from different providers does not collide", () => {
    expect(getActionHandler("gmail", "send_channel_message")).toBeUndefined();
    expect(getActionHandler("slack", "send_email")).toBeUndefined();
  });
});
