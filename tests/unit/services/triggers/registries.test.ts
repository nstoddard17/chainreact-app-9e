/**
 * @jest-environment node
 *
 * Trigger-registry CONTAINER semantics — services/triggers/{activation,
 * deactivation,polling,subscription}Registry.ts.
 *
 * TEST-REDUNDANCY-CONSOLIDATION-2A — merged from four sibling suites
 * (activationRegistry / deactivationRegistry / pollingRegistry /
 * subscriptionRegistry .test.ts). They shared one shape: reset the registry,
 * register synthetic handlers, and assert lookup/duplicate/scoping semantics.
 *
 * NOTE ON SCOPE: these suites deliberately operate on a RESET (empty)
 * registry with fake providers, so they do NOT assert the production trigger
 * inventory and must not be turned into an inventory contract — that would
 * contradict the `__reset*ForTests()` they each depend on. The real
 * per-provider trigger inventory is pinned elsewhere: each provider's
 * tests/unit/integrations/<provider>/manifest.test.ts asserts
 * findActivation/findDeactivation for its registered event types, and
 * tests/unit/services/triggers/lifecycle.test.ts covers dispatch.
 *
 * Each section keeps its own beforeEach reset, so the four registries stay
 * independent exactly as they were in separate processes.
 */

import {
  __resetActivationRegistryForTests,
  findActivation,
  findNativeActivation,
  registerActivation,
  registerNativeActivation,
} from "@/services/triggers/activationRegistry";
import {
  __resetDeactivationRegistryForTests,
  findDeactivation,
  registerDeactivation,
} from "@/services/triggers/deactivationRegistry";
import {
  __resetPollingRegistryForTests,
  findPollingHandler,
  registerPollingHandler,
} from "@/services/triggers/pollingRegistry";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import {
  __resetSubscriptionRegistryForTests,
  findSubscriptionHandler,
  registerSubscriptionHandler,
  type SubscriptionHandler,
} from "@/services/triggers/subscriptionRegistry";

// ---------------------------------------------------------------------------
// Merged verbatim from the former activationRegistry.test.ts
// ---------------------------------------------------------------------------
describe("activationRegistry", () => {

  beforeEach(() => {
    __resetActivationRegistryForTests();
  });

  describe("activationRegistry — provider activations", () => {
    it("returns null when no activation is registered for (provider, eventType)", () => {
      expect(findActivation("gmail", "new_email")).toBeNull();
    });

    it("returns the registered fn for an exact (provider, eventType) match", async () => {
      const fn = jest.fn(async () => ({ snapshot: { historyId: "42" } }));
      registerActivation("gmail", "new_email", fn);
      const found = findActivation("gmail", "new_email");
      expect(found).toBe(fn);
      expect(findActivation("gmail", "new_label")).toBeNull();
      expect(findActivation("slack", "new_email")).toBeNull();
    });

    it("throws on duplicate registration of the same (provider, eventType)", () => {
      registerActivation("gmail", "new_email", async () => ({}));
      expect(() =>
        registerActivation("gmail", "new_email", async () => ({})),
      ).toThrow(/duplicate registration/i);
    });
  });

  describe("activationRegistry — native activations (Native Slice 2)", () => {
    // Native activations get their own parallel registry per
    // docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §6.2.
    // The context has no `integration` field — provider activations
    // stay untouched.

    it("returns null when no native activation is registered", () => {
      expect(findNativeActivation("native", "schedule.fired")).toBeNull();
    });

    it("registers + finds a NativeActivationFn (no integration required)", async () => {
      const fn = jest.fn(async () => ({ nextFireAt: "2026-05-16T09:00:00Z" }));
      registerNativeActivation("native", "schedule.fired", fn);
      const found = findNativeActivation("native", "schedule.fired");
      expect(found).toBe(fn);
    });

    it("throws on duplicate native registration of the same (provider, eventType)", () => {
      registerNativeActivation("native", "schedule.fired", async () => ({}));
      expect(() =>
        registerNativeActivation("native", "schedule.fired", async () => ({})),
      ).toThrow(/duplicate native registration/i);
    });

    it("native and provider registries are independent — same key allowed in each", () => {
      // Conceptually nothing should register the same key in both registries
      // (per the docstring), but the surface allows it; the lifecycle
      // dispatch order (native first) gives native precedence.
      const providerFn = jest.fn(async () => ({ via: "provider" }));
      const nativeFn = jest.fn(async () => ({ via: "native" }));
      registerActivation("test-provider", "test-event", providerFn);
      registerNativeActivation("test-provider", "test-event", nativeFn);
      expect(findActivation("test-provider", "test-event")).toBe(providerFn);
      expect(findNativeActivation("test-provider", "test-event")).toBe(nativeFn);
    });

    it("__resetActivationRegistryForTests clears BOTH provider and native registries", () => {
      registerActivation("gmail", "new_email", async () => ({}));
      registerNativeActivation("native", "schedule.fired", async () => ({}));
      __resetActivationRegistryForTests();
      expect(findActivation("gmail", "new_email")).toBeNull();
      expect(findNativeActivation("native", "schedule.fired")).toBeNull();
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former deactivationRegistry.test.ts
// ---------------------------------------------------------------------------
describe("deactivationRegistry", () => {

  beforeEach(() => {
    __resetDeactivationRegistryForTests();
  });

  describe("deactivationRegistry", () => {
    it("findDeactivation returns null when nothing is registered", () => {
      expect(findDeactivation("google-calendar", "event_changed")).toBeNull();
    });

    it("register + find round-trip on (provider, eventType)", async () => {
      const fn = jest.fn(async () => {});
      registerDeactivation("google-calendar", "event_changed", fn);
      expect(findDeactivation("google-calendar", "event_changed")).toBe(fn);
    });

    it("registrations are scoped per (provider, eventType)", async () => {
      const a = jest.fn(async () => {});
      const b = jest.fn(async () => {});
      registerDeactivation("google-calendar", "event_changed", a);
      registerDeactivation("google-drive", "file_changed", b);
      expect(findDeactivation("google-calendar", "event_changed")).toBe(a);
      expect(findDeactivation("google-drive", "file_changed")).toBe(b);
      expect(findDeactivation("google-calendar", "file_changed")).toBeNull();
    });

    it("throws on duplicate registration for the same key", () => {
      registerDeactivation("p", "e", async () => {});
      expect(() => registerDeactivation("p", "e", async () => {})).toThrow(
        /duplicate registration/,
      );
    });

    it("__resetDeactivationRegistryForTests clears registrations", () => {
      registerDeactivation("p", "e", async () => {});
      __resetDeactivationRegistryForTests();
      expect(findDeactivation("p", "e")).toBeNull();
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former pollingRegistry.test.ts
// ---------------------------------------------------------------------------
describe("pollingRegistry", () => {

  function makeTrigger(provider: string): TriggerResourceRecord {
    return {
      id: "tr-1",
      workflowId: "wf-1",
      workflowAccountId: "acct-1",
      userId: "user-1",
      provider,
      eventType: "new_email",
      nodeId: "n1",
      config: { pollingEnabled: true },
      providerAccountId: null,
      registeredAt: "2026-05-07T00:00:00Z",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "2026-05-07T00:00:00Z",
      updatedAt: "2026-05-07T00:00:00Z",
    };
  }

  beforeEach(() => {
    __resetPollingRegistryForTests();
  });

  describe("pollingRegistry", () => {
    it("returns null when no handler matches", () => {
      expect(findPollingHandler(makeTrigger("gmail"))).toBeNull();
    });

    it("returns the first handler whose canHandle returns true", () => {
      const gmail = {
        id: "gmail",
        canHandle: (t: TriggerResourceRecord) => t.provider === "gmail",
        getIntervalMs: () => 1000,
        poll: jest.fn(),
      };
      const slack = {
        id: "slack",
        canHandle: (t: TriggerResourceRecord) => t.provider === "slack",
        getIntervalMs: () => 1000,
        poll: jest.fn(),
      };
      registerPollingHandler(gmail);
      registerPollingHandler(slack);
      expect(findPollingHandler(makeTrigger("gmail"))).toBe(gmail);
      expect(findPollingHandler(makeTrigger("slack"))).toBe(slack);
      expect(findPollingHandler(makeTrigger("notion"))).toBeNull();
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former subscriptionRegistry.test.ts
// ---------------------------------------------------------------------------
describe("subscriptionRegistry", () => {

  beforeEach(() => {
    __resetSubscriptionRegistryForTests();
  });

  function makeTrigger(overrides: Partial<TriggerResourceRecord> = {}): TriggerResourceRecord {
    return {
      id: "tr-1",
      workflowId: "wf-1",
      workflowAccountId: "acct-1",
      userId: "user-1",
      provider: "google-calendar",
      eventType: "event_changed",
      nodeId: "n1",
      config: { type: "subscription-watch" },
      providerAccountId: null,
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

});
