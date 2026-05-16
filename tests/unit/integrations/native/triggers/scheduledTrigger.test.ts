/**
 * @jest-environment node
 *
 * Tests for integrations/native/triggers/scheduledTrigger — Native-nodes
 * Slice 2 Commit 3 (docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md
 * §10.3).
 *
 * Covers:
 *   - ScheduledTriggerConfigSchema accepts valid 5-field UTC crons,
 *     rejects presets / 6-field / nonsense / oversized.
 *   - Activation hook computes the FIRST nextFireAt strictly after the
 *     activation instant and returns the persisted-config patch shape.
 *   - The hook is registered against the native activation registry on
 *     module import.
 */

import { ZodError } from "zod";
import { __resetActivationRegistryForTests, findNativeActivation } from "@/services/triggers/activationRegistry";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockComputeNextFireTime = jest.fn();
jest.mock("@/services/cron/cronExpression", () => {
  const actual = jest.requireActual("@/services/cron/cronExpression");
  return {
    ...actual,
    computeNextFireTime: (...args: unknown[]) =>
      mockComputeNextFireTime(...args),
  };
});

// Re-import after the jest.mock factory so the schema's `.refine` binds
// to the real isValidCronExpression, and the activation hook binds to
// the mocked computeNextFireTime.
import {
  SCHEDULED_TRIGGER_EVENT_TYPE,
  SCHEDULED_TRIGGER_PROVIDER,
  ScheduledTriggerConfigSchema,
} from "@/integrations/native/triggers/scheduledTrigger";

beforeEach(() => {
  mockComputeNextFireTime.mockReset();
  // Sensible default — most tests want a successful computation.
  mockComputeNextFireTime.mockReturnValue(new Date("2026-05-16T09:00:00Z"));
});

describe("ScheduledTriggerConfigSchema — accepts", () => {
  it("standard every-15-minutes", () => {
    expect(
      ScheduledTriggerConfigSchema.parse({ cronExpression: "*/15 * * * *" }),
    ).toEqual({ cronExpression: "*/15 * * * *" });
  });

  it("weekday-only morning fire", () => {
    expect(
      ScheduledTriggerConfigSchema.parse({ cronExpression: "0 9 * * 1-5" }),
    ).toEqual({ cronExpression: "0 9 * * 1-5" });
  });

  it("monthly first-of-month at midnight", () => {
    expect(
      ScheduledTriggerConfigSchema.parse({ cronExpression: "0 0 1 * *" }),
    ).toEqual({ cronExpression: "0 0 1 * *" });
  });
});

describe("ScheduledTriggerConfigSchema — rejects", () => {
  it("missing cronExpression", () => {
    expect(() => ScheduledTriggerConfigSchema.parse({})).toThrow(ZodError);
  });

  it("empty cronExpression", () => {
    expect(() =>
      ScheduledTriggerConfigSchema.parse({ cronExpression: "" }),
    ).toThrow(ZodError);
  });

  it("preset @hourly", () => {
    expect(() =>
      ScheduledTriggerConfigSchema.parse({ cronExpression: "@hourly" }),
    ).toThrow(ZodError);
  });

  it("preset @daily", () => {
    expect(() =>
      ScheduledTriggerConfigSchema.parse({ cronExpression: "@daily" }),
    ).toThrow(ZodError);
  });

  it("6-field second-precision", () => {
    expect(() =>
      ScheduledTriggerConfigSchema.parse({
        cronExpression: "0 */5 * * * *",
      }),
    ).toThrow(ZodError);
  });

  it("nonsense string", () => {
    expect(() =>
      ScheduledTriggerConfigSchema.parse({
        cronExpression: "foo bar baz qux quux",
      }),
    ).toThrow(ZodError);
  });

  it("cronExpression > 120 chars", () => {
    const oversized = "* ".repeat(70).trim(); // > 120 chars
    expect(() =>
      ScheduledTriggerConfigSchema.parse({ cronExpression: oversized }),
    ).toThrow(ZodError);
  });

  it("unknown extension fields (.strict)", () => {
    expect(() =>
      ScheduledTriggerConfigSchema.parse({
        cronExpression: "*/5 * * * *",
        timezone: "America/New_York",
      }),
    ).toThrow(ZodError);
  });
});

describe("scheduled_trigger constants + registry binding", () => {
  it("SCHEDULED_TRIGGER_PROVIDER === 'native'", () => {
    expect(SCHEDULED_TRIGGER_PROVIDER).toBe("native");
  });

  it("SCHEDULED_TRIGGER_EVENT_TYPE === 'schedule.fired'", () => {
    expect(SCHEDULED_TRIGGER_EVENT_TYPE).toBe("schedule.fired");
  });

  it("is registered as a NativeActivationFn at module load", () => {
    const fn = findNativeActivation(
      SCHEDULED_TRIGGER_PROVIDER,
      SCHEDULED_TRIGGER_EVENT_TYPE,
    );
    expect(fn).not.toBeNull();
    expect(typeof fn).toBe("function");
  });
});

describe("scheduled_trigger activation hook", () => {
  function buildNode(cronExpression = "0 9 * * 1-5"): WorkflowNode {
    return {
      id: "trigger-node",
      kind: "trigger",
      provider: SCHEDULED_TRIGGER_PROVIDER,
      type: SCHEDULED_TRIGGER_EVENT_TYPE,
      config: { cronExpression },
      position: { x: 0, y: 0 },
    };
  }

  it("returns { cronExpression, nextFireAt, schedulerState } patch", async () => {
    mockComputeNextFireTime.mockReturnValueOnce(
      new Date("2026-05-18T09:00:00Z"),
    );
    const fn = findNativeActivation(
      SCHEDULED_TRIGGER_PROVIDER,
      SCHEDULED_TRIGGER_EVENT_TYPE,
    )!;
    const patch = await fn({ node: buildNode("0 9 * * 1-5"), workflowId: "wf-1" });
    expect(patch).toEqual({
      cronExpression: "0 9 * * 1-5",
      nextFireAt: "2026-05-18T09:00:00.000Z",
      schedulerState: "armed",
    });
  });

  it("re-parses the node's config defensively (.strict schema)", async () => {
    const fn = findNativeActivation(
      SCHEDULED_TRIGGER_PROVIDER,
      SCHEDULED_TRIGGER_EVENT_TYPE,
    )!;
    // Stale config with a now-rejected legacy key.
    const node: WorkflowNode = {
      ...buildNode("0 9 * * 1-5"),
      config: { cronExpression: "0 9 * * 1-5", timezone: "America/New_York" },
    };
    await expect(fn({ node, workflowId: "wf-1" })).rejects.toBeInstanceOf(ZodError);
  });

  it("throws when computeNextFireTime returns null (defense-in-depth)", async () => {
    mockComputeNextFireTime.mockReturnValueOnce(null);
    const fn = findNativeActivation(
      SCHEDULED_TRIGGER_PROVIDER,
      SCHEDULED_TRIGGER_EVENT_TYPE,
    )!;
    await expect(
      fn({ node: buildNode("0 9 * * 1-5"), workflowId: "wf-1" }),
    ).rejects.toThrow(/no next fire time/);
  });
});

// NOTE: this test must NOT reset the registry — the module's
// registration runs once at import and the schedule.fired hook must
// remain findable for the other tests in this file. Keep
// __resetActivationRegistryForTests OUT of beforeEach here.
void __resetActivationRegistryForTests;
