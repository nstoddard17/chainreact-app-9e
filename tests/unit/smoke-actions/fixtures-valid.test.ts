/**
 * @jest-environment node
 *
 * Action smoke harness — every shipped fixture is valid against the REAL
 * registry + the destructive guard.
 *
 * This is the structural guard (req #7): a fixture cannot target an action that
 * has no registered handler, cannot use an invalid risk, and — critically —
 * cannot mark an obviously destructive action (delete/purge/…) as read/write.
 */
import {
  classifyObviouslyDestructive,
  validateFixtureDescriptor,
  type FixtureDescriptor,
} from "@/scripts/chainreact/smoke/core";
import { ALL_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { registeredActionKeys } from "@/tests/smoke-actions/discovery";

describe("shipped action-smoke fixtures", () => {
  const keys = registeredActionKeys();

  it("there is at least one fixture and each targets a registered, correctly-classified action", () => {
    expect(ALL_SMOKE_FIXTURES.length).toBeGreaterThan(0);
    for (const fixture of ALL_SMOKE_FIXTURES) {
      const descriptor: FixtureDescriptor = {
        provider: fixture.provider,
        action: fixture.action,
        risk: fixture.risk,
        requiredEnv: fixture.requiredEnv ?? [],
      };
      const violations = validateFixtureDescriptor(descriptor, keys);
      expect(violations).toEqual([]);
    }
  });

  it("any fixture whose action verb is obviously destructive is classified destructive", () => {
    for (const fixture of ALL_SMOKE_FIXTURES) {
      if (classifyObviouslyDestructive(fixture.action)) {
        expect(fixture.risk).toBe("destructive");
      }
    }
  });

  it("a destructive fixture is NEVER liveSafe (it must not be runnable in live mode)", () => {
    for (const fixture of ALL_SMOKE_FIXTURES) {
      const isDestructive =
        fixture.risk === "destructive" ||
        fixture.liveRisk === "destructive" ||
        classifyObviouslyDestructive(fixture.action);
      if (isDestructive) {
        expect(fixture.liveSafe === true).toBe(false);
      }
    }
  });

  it("no two fixtures collide on the same (provider, action) key", () => {
    const seen = new Set<string>();
    for (const f of ALL_SMOKE_FIXTURES) {
      const key = `${f.provider}:${f.action}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
