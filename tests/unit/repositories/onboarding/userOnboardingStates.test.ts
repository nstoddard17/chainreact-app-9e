/**
 * @jest-environment node
 *
 * 5.ONBOARD-1 provenance correction — repository-level guarantees for
 * `user_onboarding_states`:
 *   - the completion latch is ONE conditional UPDATE (never read-then-write),
 *     writing completed_at + completion_workflow_id + completion_workflow_name
 *     atomically under `completed_at IS NULL`
 *   - it reports whether THIS call won (drives the one-time funnel event)
 *   - the presentation patch has no path to any provenance column
 *   - rows written before the correction (no snapshot) map back safely
 *
 * The Supabase client is replaced with a chainable recorder so the exact query
 * shape is asserted — that shape IS the concurrency guarantee.
 */
const calls: Array<{ table: string; op: string; payload?: unknown; filters: unknown[] }> = [];

function makeBuilder(table: string, result: { data: unknown; error: unknown }) {
  const record: { table: string; op: string; payload?: unknown; filters: unknown[] } = {
    table,
    op: "",
    filters: [],
  };
  calls.push(record);
  const builder: Record<string, unknown> = {};
  const chain = (op: string) => (...args: unknown[]) => {
    if (op === "update" || op === "upsert" || op === "insert") {
      record.op = op;
      record.payload = args[0];
    } else {
      record.filters.push({ op, args });
    }
    return builder;
  };
  for (const op of ["update", "upsert", "insert", "eq", "is", "not", "select", "in", "limit", "order"]) {
    builder[op] = chain(op);
  }
  // Terminal awaits
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  return builder;
}

let nextResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: () => ({
    from: (table: string) => makeBuilder(table, nextResult),
  }),
}));

import {
  latchCompletionServiceRole,
  updatePresentationServiceRole,
  getServiceRole,
} from "@/repositories/onboarding/userOnboardingStates";

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: [], error: null };
});

function latchCall() {
  // The first call is ensureRow's upsert; the latch UPDATE is the one carrying
  // completed_at.
  return calls.find(
    (c) =>
      c.op === "update" &&
      typeof c.payload === "object" &&
      c.payload !== null &&
      "completed_at" in (c.payload as Record<string, unknown>),
  );
}

describe("latchCompletionServiceRole — atomic provenance", () => {
  it("writes completed_at + id + NAME in a SINGLE update guarded by completed_at IS NULL", async () => {
    nextResult = { data: [{ user_id: "u1" }], error: null };
    const won = await latchCompletionServiceRole({
      userId: "u1",
      accountId: "a1",
      workflowId: "wf-1",
      workflowName: "Lead intake → Slack",
    });
    expect(won).toBe(true);

    const latch = latchCall();
    expect(latch).toBeDefined();
    const payload = latch!.payload as Record<string, unknown>;
    // All three provenance fields in ONE payload — never a partial write.
    expect(payload.completed_at).toEqual(expect.any(String));
    expect(payload.completion_workflow_id).toBe("wf-1");
    expect(payload.completion_workflow_name).toBe("Lead intake → Slack");

    // The single-winner predicate must be present on that same statement.
    expect(latch!.filters).toContainEqual({ op: "is", args: ["completed_at", null] });
    expect(latch!.filters).toContainEqual({ op: "eq", args: ["user_id", "u1"] });
    expect(latch!.filters).toContainEqual({ op: "eq", args: ["account_id", "a1"] });
  });

  it("NEVER reads-then-writes: no select of completed_at precedes the update", async () => {
    nextResult = { data: [{ user_id: "u1" }], error: null };
    await latchCompletionServiceRole({
      userId: "u1",
      accountId: "a1",
      workflowId: "wf-1",
      workflowName: "N",
    });
    const latchIndex = calls.indexOf(latchCall()!);
    const priorReads = calls
      .slice(0, latchIndex)
      .filter((c) => c.op === "" && c.filters.some((f) => (f as { op: string }).op === "select"));
    expect(priorReads).toHaveLength(0);
  });

  it("reports false when the conditional update matched no row (a later/concurrent activation)", async () => {
    nextResult = { data: [], error: null };
    const won = await latchCompletionServiceRole({
      userId: "u1",
      accountId: "a1",
      workflowId: "wf-2",
      workflowName: "Second",
    });
    // Loser: no rows updated ⇒ the original provenance is untouched.
    expect(won).toBe(false);
  });

  it("stores a null snapshot rather than undefined when the name is unknowable", async () => {
    nextResult = { data: [{ user_id: "u1" }], error: null };
    await latchCompletionServiceRole({ userId: "u1", accountId: "a1", workflowId: "wf-1" });
    const payload = latchCall()!.payload as Record<string, unknown>;
    expect(payload.completion_workflow_name).toBeNull();
  });

  it("silent latch also stamps celebrated_at in the same statement", async () => {
    nextResult = { data: [{ user_id: "u1" }], error: null };
    await latchCompletionServiceRole({
      userId: "u1",
      accountId: "a1",
      workflowId: "wf-1",
      workflowName: "Old workflow",
      silent: true,
    });
    const payload = latchCall()!.payload as Record<string, unknown>;
    expect(payload.celebrated_at).toEqual(expect.any(String));
    expect(payload.completion_workflow_name).toBe("Old workflow");
  });
});

describe("updatePresentationServiceRole — provenance is unreachable", () => {
  it.each([
    "completed_at",
    "completion_workflow_id",
    "completion_workflow_name",
  ])("never emits %s even when a caller smuggles it in", async (field) => {
    nextResult = { data: { user_id: "u1", account_id: "a1", minimized: true }, error: null };
    await updatePresentationServiceRole("u1", "a1", {
      minimized: true,
      // Deliberately hostile input; the patch type has no such field and the
      // implementation allow-lists what it maps.
      [field]: "forged",
    } as unknown as Parameters<typeof updatePresentationServiceRole>[2]);
    const update = calls.find((c) => c.op === "update");
    expect(update).toBeDefined();
    expect(Object.keys(update!.payload as Record<string, unknown>)).not.toContain(field);
  });
});

describe("row mapping — back-compat", () => {
  it("a pre-correction row without the snapshot column maps to null, not undefined", async () => {
    nextResult = {
      data: {
        user_id: "u1",
        account_id: "a1",
        selected_workflow_id: null,
        completion_workflow_id: "wf-1",
        // completion_workflow_name intentionally absent (older row shape)
        first_shown_at: null,
        dismissed_at: null,
        minimized: false,
        video_watched_at: null,
        completed_at: "2026-07-01T00:00:00Z",
        celebrated_at: null,
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
      },
      error: null,
    };
    const record = await getServiceRole("u1", "a1");
    expect(record?.completionWorkflowName).toBeNull();
    expect(record?.completedAt).toBe("2026-07-01T00:00:00Z");
  });
});
