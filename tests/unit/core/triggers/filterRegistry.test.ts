/**
 * @jest-environment node
 *
 * Tests for core/triggers/filterRegistry.ts.
 *
 * Verifies the contract from docs/slices/slack-2-1-messaging-reactions-plan.md §4.2:
 *   - Lookups keyed on (provider, eventType).
 *   - Missing filter returns null.
 *   - Duplicate registration throws.
 *   - Registry isolates per (provider, eventType) — one provider's
 *     registration doesn't shadow another's.
 */

import {
  __resetTriggerFilterRegistryForTests,
  getTriggerFilter,
  registerTriggerFilter,
} from "@/core/triggers/filterRegistry";
import type { FilterResult, TriggerFilter } from "@/core/triggers/filterContract";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeFilter(provider: string, eventType: string): TriggerFilter {
  return {
    provider,
    eventType,
    parseConfig: (raw): unknown => raw,
    evaluate: (_event: TriggerEvent, _config: unknown): FilterResult => ({
      kind: "match",
    }),
  };
}

beforeEach(() => {
  __resetTriggerFilterRegistryForTests();
});

describe("registerTriggerFilter / getTriggerFilter", () => {
  it("returns null when no filter is registered for the (provider, eventType)", () => {
    expect(getTriggerFilter("slack", "slack.message.channel")).toBeNull();
  });

  it("returns the registered filter for the matching (provider, eventType)", () => {
    const filter = makeFilter("slack", "slack.message.channel");
    registerTriggerFilter(filter);
    expect(getTriggerFilter("slack", "slack.message.channel")).toBe(filter);
  });

  it("isolates filters by provider — same eventType under a different provider returns null", () => {
    registerTriggerFilter(makeFilter("slack", "shared.eventType"));
    expect(getTriggerFilter("github", "shared.eventType")).toBeNull();
  });

  it("isolates filters by eventType — same provider under a different eventType returns null", () => {
    registerTriggerFilter(makeFilter("slack", "slack.message.channel"));
    expect(getTriggerFilter("slack", "slack.reaction_added")).toBeNull();
  });

  it("supports many filters across multiple providers and event types", () => {
    const a = makeFilter("slack", "slack.message.channel");
    const b = makeFilter("slack", "slack.reaction_added");
    const c = makeFilter("github", "github.push");
    registerTriggerFilter(a);
    registerTriggerFilter(b);
    registerTriggerFilter(c);
    expect(getTriggerFilter("slack", "slack.message.channel")).toBe(a);
    expect(getTriggerFilter("slack", "slack.reaction_added")).toBe(b);
    expect(getTriggerFilter("github", "github.push")).toBe(c);
  });
});

describe("registerTriggerFilter — duplicate registration", () => {
  it("throws when the same (provider, eventType) is registered twice", () => {
    registerTriggerFilter(makeFilter("slack", "slack.message.channel"));
    expect(() =>
      registerTriggerFilter(makeFilter("slack", "slack.message.channel")),
    ).toThrow(/already registered for slack:slack\.message\.channel/);
  });

  it("does not affect the previously-registered filter when a duplicate registration throws", () => {
    const first = makeFilter("slack", "slack.message.channel");
    registerTriggerFilter(first);
    try {
      registerTriggerFilter(makeFilter("slack", "slack.message.channel"));
    } catch {
      // expected
    }
    expect(getTriggerFilter("slack", "slack.message.channel")).toBe(first);
  });
});

describe("__resetTriggerFilterRegistryForTests", () => {
  it("clears all registered filters", () => {
    registerTriggerFilter(makeFilter("slack", "slack.message.channel"));
    registerTriggerFilter(makeFilter("github", "github.push"));
    __resetTriggerFilterRegistryForTests();
    expect(getTriggerFilter("slack", "slack.message.channel")).toBeNull();
    expect(getTriggerFilter("github", "github.push")).toBeNull();
  });
});
