/**
 * @jest-environment node
 */
import {
  __resetSubscriptionRegistryForTests,
  findSubscriptionHandler,
  registerSubscriptionHandler,
  type SubscriptionHandler,
} from "@/services/triggers/subscriptionRegistry";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

beforeEach(() => {
  __resetSubscriptionRegistryForTests();
});

function makeTrigger(overrides: Partial<TriggerResourceRecord> = {}): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    userId: "user-1",
    provider: "google-calendar",
    eventType: "event_changed",
    nodeId: "n1",
    config: { type: "subscription-watch" },
    accountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function makeHandler(id: string, predicate: (t: TriggerResourceRecord) => boolean): SubscriptionHandler {
  return {
    id,
    canHandle: predicate,
    getRenewalThresholdMs: () => 24 * 60 * 60 * 1000,
    renew: async () => {},
  };
}

describe("subscriptionRegistry", () => {
  it("findSubscriptionHandler returns null when nothing is registered", () => {
    expect(findSubscriptionHandler(makeTrigger())).toBeNull();
  });

  it("registerSubscriptionHandler + findSubscriptionHandler round-trip", () => {
    const handler = makeHandler(
      "test-handler",
      (t) => t.provider === "google-calendar",
    );
    registerSubscriptionHandler(handler);
    const found = findSubscriptionHandler(makeTrigger());
    expect(found).toBe(handler);
  });

  it("first handler whose canHandle returns true wins", () => {
    const a = makeHandler("a", () => true);
    const b = makeHandler("b", () => true);
    registerSubscriptionHandler(a);
    registerSubscriptionHandler(b);
    expect(findSubscriptionHandler(makeTrigger())?.id).toBe("a");
  });

  it("returns null when no handler matches", () => {
    registerSubscriptionHandler(
      makeHandler("for-slack", (t) => t.provider === "slack"),
    );
    expect(findSubscriptionHandler(makeTrigger())).toBeNull();
  });

  it("__resetSubscriptionRegistryForTests clears registrations", () => {
    registerSubscriptionHandler(makeHandler("a", () => true));
    expect(findSubscriptionHandler(makeTrigger())).not.toBeNull();
    __resetSubscriptionRegistryForTests();
    expect(findSubscriptionHandler(makeTrigger())).toBeNull();
  });
});
