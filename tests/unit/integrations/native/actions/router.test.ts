/**
 * @jest-environment node
 *
 * Tests for integrations/native/actions/router — Native-nodes Slice 3
 * Commit 3 (docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md §9.3).
 *
 * N-label branching action backing the engine's label-aware traversal.
 * Operator semantics live in `_conditionEvaluator.ts` (Commit 1); these
 * tests focus on schema enforcement + first-match-wins ordering +
 * branchTaken emission + output shape.
 */

import { ZodError } from "zod";
import { router } from "@/integrations/native/actions/router";
import {
  RouterConfigSchema,
  ROUTER_MAX_ROUTES,
  ROUTE_LABEL_MAX,
} from "@/integrations/native/actions/router.schema";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "evt-1",
  occurredAt: "2026-05-16T00:00:00Z",
  providerAccountId: "system",
  payload: {},
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n-router",
    config,
    triggerEvent,
  };
}

function routeFor(label: string, value: unknown) {
  return {
    label,
    condition: { input: "{{trigger.payload.tier}}", operator: "equals", value },
  };
}

// ── Schema tests ────────────────────────────────────────────────────────────

describe("router schema", () => {
  it("accepts a valid single-route config", () => {
    const r = RouterConfigSchema.parse({
      routes: [routeFor("vip", "vip")],
    });
    expect(r.routes).toHaveLength(1);
    expect(r.defaultRoute).toBeUndefined();
  });

  it("accepts a valid multi-route config with defaultRoute", () => {
    const r = RouterConfigSchema.parse({
      routes: [routeFor("vip", "vip"), routeFor("premium", "premium")],
      defaultRoute: "standard",
    });
    expect(r.routes).toHaveLength(2);
    expect(r.defaultRoute).toBe("standard");
  });

  it("rejects routes: [] (empty routes is a no-op error)", () => {
    expect(() => RouterConfigSchema.parse({ routes: [] })).toThrow(ZodError);
  });

  it("rejects more than ROUTER_MAX_ROUTES (32) routes", () => {
    const tooMany = Array.from({ length: ROUTER_MAX_ROUTES + 1 }, (_, i) =>
      routeFor(`r${i}`, `v${i}`),
    );
    expect(() => RouterConfigSchema.parse({ routes: tooMany })).toThrow(ZodError);
    // Exactly ROUTER_MAX_ROUTES is fine.
    const exact = Array.from({ length: ROUTER_MAX_ROUTES }, (_, i) =>
      routeFor(`r${i}`, `v${i}`),
    );
    expect(() => RouterConfigSchema.parse({ routes: exact })).not.toThrow();
  });

  it("rejects duplicate route labels", () => {
    expect(() =>
      RouterConfigSchema.parse({
        routes: [routeFor("vip", "vip"), routeFor("vip", "alt")],
      }),
    ).toThrow(/Duplicate route label/);
  });

  it("rejects empty / too-long route labels", () => {
    expect(() =>
      RouterConfigSchema.parse({
        routes: [{ label: "", condition: { input: "x", operator: "equals", value: "x" } }],
      }),
    ).toThrow(ZodError);
    expect(() =>
      RouterConfigSchema.parse({
        routes: [
          {
            label: "x".repeat(ROUTE_LABEL_MAX + 1),
            condition: { input: "x", operator: "equals", value: "x" },
          },
        ],
      }),
    ).toThrow(ZodError);
  });

  it("rejects unknown top-level fields via .strict() (guards V1's dropped mode / stopMessage / logicOperator)", () => {
    expect(() =>
      RouterConfigSchema.parse({
        routes: [routeFor("vip", "vip")],
        mode: "router",
      }),
    ).toThrow(ZodError);
    expect(() =>
      RouterConfigSchema.parse({
        routes: [routeFor("vip", "vip")],
        stopMessage: "halt",
      }),
    ).toThrow(ZodError);
  });

  it("rejects empty / too-long defaultRoute label", () => {
    expect(() =>
      RouterConfigSchema.parse({
        routes: [routeFor("vip", "vip")],
        defaultRoute: "",
      }),
    ).toThrow(ZodError);
    expect(() =>
      RouterConfigSchema.parse({
        routes: [routeFor("vip", "vip")],
        defaultRoute: "x".repeat(ROUTE_LABEL_MAX + 1),
      }),
    ).toThrow(ZodError);
  });

  it("rejects unary operator with value AND binary operator without value inside a route condition", () => {
    expect(() =>
      RouterConfigSchema.parse({
        routes: [
          {
            label: "u",
            condition: { input: "x", operator: "is_empty", value: "v" },
          },
        ],
      }),
    ).toThrow(/unary.*does not take/i);
    expect(() =>
      RouterConfigSchema.parse({
        routes: [
          {
            label: "b",
            condition: { input: "x", operator: "equals" },
          },
        ],
      }),
    ).toThrow(/binary.*requires/i);
  });

  it("rejects an unknown operator literal at parse time (D-RT1: closed 14-operator union)", () => {
    expect(() =>
      RouterConfigSchema.parse({
        routes: [
          {
            label: "r",
            condition: { input: "x", operator: "regex_match", value: "y" },
          },
        ],
      }),
    ).toThrow(ZodError);
  });

  it("rejects unknown fields inside a route entry / route.condition (.strict())", () => {
    expect(() =>
      RouterConfigSchema.parse({
        routes: [
          {
            label: "a",
            condition: { input: "x", operator: "equals", value: "x" },
            logicOperator: "and",
          },
        ],
      }),
    ).toThrow(ZodError);
    expect(() =>
      RouterConfigSchema.parse({
        routes: [
          {
            label: "a",
            condition: {
              input: "x",
              operator: "equals",
              value: "x",
              caseSensitive: true,
            },
          },
        ],
      }),
    ).toThrow(ZodError);
  });
});

// ── Handler — first-match-wins ──────────────────────────────────────────────

describe("router handler — first-match-wins", () => {
  it("returns the first matching route's label and stops evaluating", async () => {
    const r = await router(
      makeInput({
        routes: [
          { label: "vip", condition: { input: "vip", operator: "equals", value: "vip" } },
          { label: "premium", condition: { input: "vip", operator: "equals", value: "premium" } },
        ],
      }),
    );
    expect(r.branchTaken).toBe("vip");
    expect(r.output.matched).toBe(true);
    expect(r.output.routeLabel).toBe("vip");
    expect(r.output.evaluatedCount).toBe(1);
  });

  it("falls through to the second route when the first does not match", async () => {
    const r = await router(
      makeInput({
        routes: [
          { label: "vip", condition: { input: "premium", operator: "equals", value: "vip" } },
          { label: "premium", condition: { input: "premium", operator: "equals", value: "premium" } },
        ],
      }),
    );
    expect(r.branchTaken).toBe("premium");
    expect(r.output.matched).toBe(true);
    expect(r.output.routeLabel).toBe("premium");
    expect(r.output.evaluatedCount).toBe(2);
  });

  it("shadows: when two routes' conditions both match, the earlier one wins", async () => {
    // Both routes have a condition that matches input "x" — the order
    // determines the winner.
    const r = await router(
      makeInput({
        routes: [
          { label: "first", condition: { input: "x", operator: "contains", value: "x" } },
          { label: "second", condition: { input: "x", operator: "equals", value: "x" } },
        ],
      }),
    );
    expect(r.branchTaken).toBe("first");
    expect(r.output.evaluatedCount).toBe(1);
  });
});

// ── Handler — no-match behavior ─────────────────────────────────────────────

describe("router handler — no match + defaultRoute configured", () => {
  it("returns branchTaken: defaultRoute when no route matches", async () => {
    const r = await router(
      makeInput({
        routes: [
          { label: "vip", condition: { input: "standard", operator: "equals", value: "vip" } },
          { label: "premium", condition: { input: "standard", operator: "equals", value: "premium" } },
        ],
        defaultRoute: "fallback",
      }),
    );
    expect(r.branchTaken).toBe("fallback");
    expect(r.output.matched).toBe(false);
    expect(r.output.routeLabel).toBe("fallback");
    expect(r.output.evaluatedCount).toBe(2);
  });

  it("defaultRoute does NOT need to be one of routes[].label (label is a free-form edge label)", async () => {
    const r = await router(
      makeInput({
        routes: [
          { label: "vip", condition: { input: "x", operator: "equals", value: "vip" } },
        ],
        defaultRoute: "anything-the-author-wants",
      }),
    );
    expect(r.branchTaken).toBe("anything-the-author-wants");
  });
});

describe("router handler — no match + no defaultRoute", () => {
  it("returns branchTaken: null when no route matches and no defaultRoute is set", async () => {
    const r = await router(
      makeInput({
        routes: [
          { label: "vip", condition: { input: "other", operator: "equals", value: "vip" } },
          { label: "premium", condition: { input: "other", operator: "equals", value: "premium" } },
        ],
      }),
    );
    expect(r.branchTaken).toBeNull();
    expect(r.output.matched).toBe(false);
    expect(r.output.routeLabel).toBeNull();
    expect(r.output.evaluatedCount).toBe(2);
  });
});

// ── Handler — evaluatedCount semantics ─────────────────────────────────────

describe("router handler — evaluatedCount semantics", () => {
  it("evaluatedCount equals the position of the matching route (1-indexed by stop point)", async () => {
    const routes = [
      { label: "r1", condition: { input: "z", operator: "equals", value: "r1" } },
      { label: "r2", condition: { input: "z", operator: "equals", value: "r2" } },
      { label: "r3", condition: { input: "z", operator: "equals", value: "z" } },
    ];
    const r = await router(makeInput({ routes }));
    expect(r.branchTaken).toBe("r3");
    expect(r.output.evaluatedCount).toBe(3);
  });

  it("evaluatedCount equals routes.length when no match (full evaluation)", async () => {
    const routes = [
      { label: "a", condition: { input: "x", operator: "equals", value: "y" } },
      { label: "b", condition: { input: "x", operator: "equals", value: "z" } },
    ];
    const r = await router(makeInput({ routes }));
    expect(r.output.evaluatedCount).toBe(2);
    expect(r.branchTaken).toBeNull();
  });
});

// ── Handler — operator/type mismatch inside a route ─────────────────────────

describe("router handler — operator/type mismatch within a route does not match (D-IT7)", () => {
  it("greater_than with non-numeric input → route does not match; next route gets a chance", async () => {
    const r = await router(
      makeInput({
        routes: [
          {
            label: "numeric",
            condition: { input: "abc", operator: "greater_than", value: 5 },
          },
          {
            label: "fallback-route",
            condition: { input: "abc", operator: "equals", value: "abc" },
          },
        ],
      }),
    );
    expect(r.branchTaken).toBe("fallback-route");
  });

  it("type-mismatch on every route + no defaultRoute → null", async () => {
    const r = await router(
      makeInput({
        routes: [
          {
            label: "a",
            condition: { input: null, operator: "contains", value: "x" },
          },
          {
            label: "b",
            condition: { input: { x: 1 }, operator: "starts_with", value: "y" },
          },
        ],
      }),
    );
    expect(r.branchTaken).toBeNull();
    expect(r.output.matched).toBe(false);
  });
});

// ── Handler — output shape ──────────────────────────────────────────────────

describe("router handler — output shape", () => {
  it("output has exactly { matched, routeLabel, evaluatedCount } scalars (no echo of input/value)", async () => {
    const r = await router(
      makeInput({
        routes: [
          { label: "match", condition: { input: "x", operator: "equals", value: "x" } },
        ],
      }),
    );
    expect(Object.keys(r.output).sort()).toEqual([
      "evaluatedCount",
      "matched",
      "routeLabel",
    ]);
  });

  it("output JSON does not contain the route's input/value secret-string (no leak path)", async () => {
    const r = await router(
      makeInput({
        routes: [
          {
            label: "match",
            condition: {
              input: "SECRET_INPUT_VALUE",
              operator: "equals",
              value: "SECRET_COMPARE_VALUE",
            },
          },
        ],
        defaultRoute: "fallback",
      }),
    );
    const serialized = JSON.stringify(r.output);
    expect(serialized).not.toContain("SECRET_INPUT_VALUE");
    expect(serialized).not.toContain("SECRET_COMPARE_VALUE");
    expect(serialized).not.toContain("operator");
  });

  it("handler emits no console.* logs (native-handler rule carried from Slice 1)", async () => {
    const spies = {
      log: jest.spyOn(console, "log").mockImplementation(() => {}),
      info: jest.spyOn(console, "info").mockImplementation(() => {}),
      warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
      error: jest.spyOn(console, "error").mockImplementation(() => {}),
      debug: jest.spyOn(console, "debug").mockImplementation(() => {}),
    };
    try {
      // Match path.
      await router(
        makeInput({
          routes: [
            { label: "a", condition: { input: "x", operator: "equals", value: "x" } },
          ],
        }),
      );
      // Default-fallback path.
      await router(
        makeInput({
          routes: [
            { label: "a", condition: { input: "x", operator: "equals", value: "y" } },
          ],
          defaultRoute: "fallback",
        }),
      );
      // Null path.
      await router(
        makeInput({
          routes: [
            { label: "a", condition: { input: "x", operator: "equals", value: "y" } },
          ],
        }),
      );
      // Type-mismatch path (defensive false from evaluator).
      await router(
        makeInput({
          routes: [
            { label: "a", condition: { input: null, operator: "contains", value: "x" } },
          ],
        }),
      );
      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.info).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).not.toHaveBeenCalled();
      expect(spies.debug).not.toHaveBeenCalled();
    } finally {
      spies.log.mockRestore();
      spies.info.mockRestore();
      spies.warn.mockRestore();
      spies.error.mockRestore();
      spies.debug.mockRestore();
    }
  });
});

// ── Handler — defense-in-depth schema parse ────────────────────────────────

describe("router handler — defense-in-depth schema parse", () => {
  it("handler re-parses config and rejects malformed input (empty routes)", async () => {
    await expect(router(makeInput({ routes: [] }))).rejects.toThrow(ZodError);
  });

  it("handler re-parses config and rejects unknown top-level fields", async () => {
    await expect(
      router(
        makeInput({
          routes: [{ label: "a", condition: { input: "x", operator: "equals", value: "x" } }],
          mode: "filter",
        }),
      ),
    ).rejects.toThrow(ZodError);
  });
});
