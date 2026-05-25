/**
 * @jest-environment node
 */

import {
  __resetActivationRegistryForTests,
  findActivation,
  findNativeActivation,
  registerActivation,
  registerNativeActivation,
} from "@/services/triggers/activationRegistry";

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
