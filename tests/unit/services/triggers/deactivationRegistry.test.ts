/**
 * @jest-environment node
 */
import {
  __resetDeactivationRegistryForTests,
  findDeactivation,
  registerDeactivation,
} from "@/services/triggers/deactivationRegistry";

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
