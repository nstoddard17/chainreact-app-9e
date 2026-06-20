/**
 * @jest-environment node
 *
 * Action smoke harness — dry-run inventory core (pure logic).
 *
 * Protects the inventory contract the operator relies on: which registered
 * actions are fixture-backed, which are missing a fixture, which are skipped and
 * why, that a provider filter narrows the view, that destructive fixtures are
 * gated, that the JSON is stable, and that an obviously-destructive action can
 * never be mis-classified as read/write.
 */
import {
  buildInventory,
  classifyObviouslyDestructive,
  renderInventoryJson,
  validateFixtureDescriptor,
  type FixtureDescriptor,
  type RegisteredAction,
} from "@/scripts/chainreact/smoke/core";

const REGISTERED: RegisteredAction[] = [
  { provider: "native", action: "format_transformer" },
  { provider: "slack", action: "list_channels" },
  { provider: "slack", action: "send_channel_message" },
  { provider: "slack", action: "delete_message" },
  { provider: "gmail", action: "send_email" },
];

const FIXTURES: FixtureDescriptor[] = [
  { provider: "native", action: "format_transformer", risk: "read", requiredEnv: [] },
  { provider: "slack", action: "list_channels", risk: "read", requiredEnv: ["SMOKE_SLACK_CONNECTED"] },
  { provider: "slack", action: "delete_message", risk: "destructive", requiredEnv: [] },
];

describe("action-smoke inventory: categorisation", () => {
  it("reports fixture-backed, missing-fixture, and skipped(destructive) per action", () => {
    const report = buildInventory(REGISTERED, FIXTURES);
    const byKey = new Map(report.rows.map((r) => [`${r.provider}:${r.action}`, r]));

    expect(byKey.get("native:format_transformer")?.status).toBe("fixture-backed");
    // A read fixture that needs a connection is still fixture-backed, but flagged
    // so the operator knows it will skip at run time without that env.
    expect(byKey.get("slack:list_channels")?.status).toBe("fixture-backed");
    expect(byKey.get("slack:list_channels")?.envGated).toBe(true);
    // No fixture authored yet.
    expect(byKey.get("slack:send_channel_message")?.status).toBe("missing-fixture");
    expect(byKey.get("gmail:send_email")?.status).toBe("missing-fixture");
    // Destructive without opt-in → skipped with the actionable reason.
    const del = byKey.get("slack:delete_message");
    expect(del?.status).toBe("skipped");
    expect(del?.note).toContain("--include-destructive");

    expect(report.totals).toEqual({
      registered: 5,
      fixtureBacked: 2,
      missingFixture: 2,
      skipped: 1,
    });
  });

  it("includes destructive fixtures as runnable when includeDestructive is set", () => {
    const report = buildInventory(REGISTERED, FIXTURES, { includeDestructive: true });
    const del = report.rows.find((r) => r.action === "delete_message");
    expect(del?.status).toBe("fixture-backed");
    expect(report.totals.skipped).toBe(0);
  });
});

describe("action-smoke inventory: provider filter", () => {
  it("lists only the requested provider and totals that provider alone", () => {
    const report = buildInventory(REGISTERED, FIXTURES, { providerFilter: "slack" });
    expect(report.rows.every((r) => r.provider === "slack")).toBe(true);
    expect(report.rows).toHaveLength(3);
    expect(report.perProvider).toHaveLength(1);
    expect(report.perProvider[0]).toMatchObject({ provider: "slack", registered: 3 });
  });

  it("returns an empty view for a provider with no registered actions", () => {
    const report = buildInventory(REGISTERED, FIXTURES, { providerFilter: "stripe" });
    expect(report.rows).toHaveLength(0);
    expect(report.totals.registered).toBe(0);
  });
});

describe("action-smoke inventory: --changed scoping", () => {
  it("restricts rows to the onlyKeys set", () => {
    const onlyKeys = new Set(["native:format_transformer"]);
    const report = buildInventory(REGISTERED, FIXTURES, { onlyKeys });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ provider: "native", action: "format_transformer" });
  });
});

describe("action-smoke inventory: coverage breakdown", () => {
  const FIXTURES_WITH_LIVESAFE: FixtureDescriptor[] = [
    { provider: "native", action: "format_transformer", risk: "read", requiredEnv: [], liveSafe: true },
    { provider: "slack", action: "list_channels", risk: "read", requiredEnv: ["X"], liveSafe: true },
    { provider: "slack", action: "send_channel_message", risk: "write", requiredEnv: [], liveSafe: true },
    { provider: "slack", action: "delete_message", risk: "destructive", requiredEnv: [] },
  ];

  it("counts liveSafe fixtures + a read/write/destructive risk breakdown", () => {
    const report = buildInventory(REGISTERED, FIXTURES_WITH_LIVESAFE);
    expect(report.coverage).toEqual({
      liveSafe: 3,
      byRisk: { read: 2, write: 1, destructive: 1 },
    });
  });

  it("scopes coverage to the provider filter", () => {
    const report = buildInventory(REGISTERED, FIXTURES_WITH_LIVESAFE, { providerFilter: "slack" });
    expect(report.coverage).toEqual({
      liveSafe: 2,
      byRisk: { read: 1, write: 1, destructive: 1 },
    });
  });
});

describe("action-smoke inventory: stable machine-readable JSON", () => {
  it("emits parseable JSON whose string form is deterministic across builds", () => {
    const a = renderInventoryJson(buildInventory(REGISTERED, FIXTURES));
    const b = renderInventoryJson(buildInventory([...REGISTERED].reverse(), [...FIXTURES].reverse()));
    // Same logical input in a different source order → byte-identical JSON.
    expect(a).toBe(b);
    const parsed = JSON.parse(a);
    expect(parsed.mode).toBe("inventory");
    expect(parsed.totals.registered).toBe(5);
    expect(Array.isArray(parsed.rows)).toBe(true);
  });
});

describe("action-smoke inventory: destructive mis-classification guard", () => {
  it("flags an obviously destructive action that is not classified destructive", () => {
    expect(classifyObviouslyDestructive("delete_message")).toBe(true);
    expect(classifyObviouslyDestructive("list_channels")).toBe(false);

    const registeredKeys = new Set(REGISTERED.map((r) => `${r.provider}:${r.action}`));
    const bad: FixtureDescriptor = {
      provider: "slack",
      action: "delete_message",
      risk: "read",
      requiredEnv: [],
    };
    const violations = validateFixtureDescriptor(bad, registeredKeys);
    expect(violations.join(" ")).toMatch(/looks destructive/);
  });

  it("flags a fixture that targets an unregistered action", () => {
    const registeredKeys = new Set(REGISTERED.map((r) => `${r.provider}:${r.action}`));
    const ghost: FixtureDescriptor = {
      provider: "slack",
      action: "teleport_message",
      risk: "write",
      requiredEnv: [],
    };
    expect(validateFixtureDescriptor(ghost, registeredKeys).join(" ")).toMatch(/no registered action handler/);
  });
});
