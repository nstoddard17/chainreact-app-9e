/**
 * @jest-environment node
 *
 * Tests for integrations/native/actions/delay — Native-nodes Slice 1
 * Commit 3 (docs/slices/parity/native-nodes-1-tier-a-plan.md §10.3).
 *
 * Pure in-process sleep; max 30s; defense-in-depth handler-level cap
 * guard. NPD-N6: durable / unbounded delay is deferred to Phase 6.
 */

import { ZodError } from "zod";
import {
  delay,
  DelayCapExceededError,
} from "@/integrations/native/actions/delay";
import {
  DELAY_MAX_SECONDS,
  DelayConfigSchema,
} from "@/integrations/native/actions/delay.schema";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "evt-1",
  occurredAt: "2026-05-15T00:00:00Z",
  providerAccountId: "system",
  payload: {},
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n-delay",
    config,
    triggerEvent,
  };
}

afterEach(() => {
  jest.useRealTimers();
});

// ── Schema tests ────────────────────────────────────────────────────────────

describe("delay schema", () => {
  it("accepts seconds=1", () => {
    expect(DelayConfigSchema.parse({ seconds: 1 }).seconds).toBe(1);
  });

  it("accepts seconds=30 (the cap)", () => {
    expect(DelayConfigSchema.parse({ seconds: 30 }).seconds).toBe(30);
  });

  it("rejects missing seconds", () => {
    expect(() => DelayConfigSchema.parse({})).toThrow(ZodError);
  });

  it("rejects seconds=0", () => {
    expect(() => DelayConfigSchema.parse({ seconds: 0 })).toThrow(ZodError);
  });

  it("rejects seconds=31 (above cap)", () => {
    expect(() => DelayConfigSchema.parse({ seconds: 31 })).toThrow(ZodError);
  });

  it("rejects non-integer seconds", () => {
    expect(() => DelayConfigSchema.parse({ seconds: 1.5 })).toThrow(ZodError);
  });

  it("rejects unknown keys (.strict — no `unit` field)", () => {
    expect(() =>
      DelayConfigSchema.parse({ seconds: 5, unit: "minutes" }),
    ).toThrow(ZodError);
  });

  it("exposes DELAY_MAX_SECONDS = 30 as a stable constant", () => {
    expect(DELAY_MAX_SECONDS).toBe(30);
  });
});

// ── Handler behaviour ──────────────────────────────────────────────────────

describe("delay handler", () => {
  it("waits the configured seconds and returns the timing output", async () => {
    jest.useFakeTimers();
    const promise = delay(makeInput({ seconds: 5 }));
    // The setTimeout hasn't fired yet — advance fake time.
    await jest.advanceTimersByTimeAsync(5 * 1000);
    const result = await promise;
    const out = result.output as {
      delayedSeconds: number;
      startedAt: string;
      completedAt: string;
    };
    expect(out.delayedSeconds).toBe(5);
    expect(typeof out.startedAt).toBe("string");
    expect(typeof out.completedAt).toBe("string");
    const elapsed =
      Date.parse(out.completedAt) - Date.parse(out.startedAt);
    expect(elapsed).toBeGreaterThanOrEqual(5 * 1000);
  });

  it("uses setTimeout under the hood (does not resolve before the timer fires)", async () => {
    jest.useFakeTimers();
    const settled = { value: false };
    delay(makeInput({ seconds: 2 })).then(() => {
      settled.value = true;
    });
    // Drain microtasks but don't advance timers — should NOT be settled.
    await Promise.resolve();
    expect(settled.value).toBe(false);
    await jest.advanceTimersByTimeAsync(1999);
    await Promise.resolve();
    expect(settled.value).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(settled.value).toBe(true);
  });

  it("seconds=1 still respects the timer (no zero-wait special case)", async () => {
    jest.useFakeTimers();
    const promise = delay(makeInput({ seconds: 1 }));
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect((result.output as { delayedSeconds: number }).delayedSeconds).toBe(
      1,
    );
  });

  it("seconds=30 (cap) sleeps the full 30 seconds", async () => {
    jest.useFakeTimers();
    const promise = delay(makeInput({ seconds: 30 }));
    await jest.advanceTimersByTimeAsync(30 * 1000);
    const result = await promise;
    expect((result.output as { delayedSeconds: number }).delayedSeconds).toBe(
      30,
    );
  });

  it("defense-in-depth: throws DelayCapExceededError when a 60s config bypasses the schema", async () => {
    const parseSpy = jest
      .spyOn(DelayConfigSchema, "parse")
      .mockReturnValueOnce({ seconds: 60 });
    try {
      await expect(delay(makeInput({ seconds: 60 }))).rejects.toBeInstanceOf(
        DelayCapExceededError,
      );
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("DelayCapExceededError carries the offending seconds value", async () => {
    const parseSpy = jest
      .spyOn(DelayConfigSchema, "parse")
      .mockReturnValueOnce({ seconds: 90 });
    try {
      await delay(makeInput({ seconds: 90 }));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DelayCapExceededError);
      expect((err as DelayCapExceededError).seconds).toBe(90);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it("schema-level rejection happens before the handler sleeps (seconds=31)", async () => {
    jest.useFakeTimers();
    const promise = delay(makeInput({ seconds: 31 }));
    await expect(promise).rejects.toBeInstanceOf(ZodError);
    // No pending timers — schema rejection short-circuits the sleep.
    expect(jest.getTimerCount()).toBe(0);
  });

  it("does not log on any path", async () => {
    jest.useFakeTimers();
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const promise = delay(makeInput({ seconds: 1 }));
      await jest.advanceTimersByTimeAsync(1000);
      await promise;
      expect(info).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

// ── Meta / handler output contract ─────────────────────────────────────────
// V2-READY-14: the builder variable picker advertises `delayMeta.outputs` as the
// references downstream nodes may use. If the meta names an output the handler
// never emits, the picker offers a `{{delay.<x>}}` that fails at runtime with
// MISSING_VARIABLE — and vice-versa, a real output the picker hides. Pin the two
// in sync so this drift (the meta previously advertised a non-existent `waited`)
// can't silently return.

describe("delay — meta/handler output contract", () => {
  it("every advertised meta output is actually emitted by the handler, and vice-versa", async () => {
    const { delayMeta } = await import(
      "@/integrations/native/actions/delay.meta"
    );

    jest.useFakeTimers();
    const promise = delay(makeInput({ seconds: 1 }));
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;

    const handlerKeys = Object.keys(result.output).sort();
    const metaKeys = delayMeta.outputs.map((o) => o.name).sort();

    expect(metaKeys).toEqual(handlerKeys);
    // Guard against the specific regression: the stale `waited` output is gone.
    expect(metaKeys).not.toContain("waited");
    expect(metaKeys).toEqual(["completedAt", "delayedSeconds", "startedAt"]);
  });

  it("advertises delayedSeconds as a number and the timestamps as strings", async () => {
    const { delayMeta } = await import(
      "@/integrations/native/actions/delay.meta"
    );
    const byName = new Map(delayMeta.outputs.map((o) => [o.name, o.type]));
    expect(byName.get("delayedSeconds")).toBe("number");
    expect(byName.get("startedAt")).toBe("string");
    expect(byName.get("completedAt")).toBe("string");
  });
});

// ── Registry wiring ────────────────────────────────────────────────────────

describe("delay — registry wiring", () => {
  it("is registered under (native, delay)", async () => {
    const { getActionHandler } = await import(
      "@/services/execution/handlers/_registry"
    );
    expect(getActionHandler("native", "delay")).toBe(delay);
  });
});
