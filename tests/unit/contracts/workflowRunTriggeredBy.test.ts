/**
 * @jest-environment node
 *
 * Type/schema guards for the run trigger-source value set after RH-1
 * (Slice 4.API-KEYS-RUN-HISTORY-2): `api_key` is accepted alongside every prior
 * source, across all three enumerations kept in lockstep with the DB CHECK —
 *   - the zod enum `WorkflowRunTriggeredBySchema` (contracts/workflow.ts),
 *   - the engine union `RunTriggerSource` (services/execution/engineTypes.ts),
 *   - the repository union `WorkflowRunTriggeredBy` (repositories/workflowRuns.ts).
 *
 * The two TS unions are checked at compile time (these assignments fail `tsc` if a
 * value is dropped); the zod enum is checked at runtime.
 */

import { WorkflowRunTriggeredBySchema } from "@/contracts/workflow";
import type { RunTriggerSource } from "@/services/execution/engineTypes";
import type { WorkflowRunTriggeredBy } from "@/repositories/workflowRuns";

const ALL_SOURCES = [
  "manual",
  "test",
  "webhook",
  "scheduled",
  "retry",
  "api_key",
  "unknown",
] as const;

describe("WorkflowRunTriggeredBySchema (zod enum)", () => {
  it("accepts 'api_key'", () => {
    expect(WorkflowRunTriggeredBySchema.parse("api_key")).toBe("api_key");
  });

  it("still accepts every prior source value", () => {
    for (const v of ALL_SOURCES) {
      expect(WorkflowRunTriggeredBySchema.parse(v)).toBe(v);
    }
  });

  it("rejects an unknown source string", () => {
    expect(WorkflowRunTriggeredBySchema.safeParse("ftp").success).toBe(false);
  });

  it("enumerates exactly the expected value set", () => {
    expect([...WorkflowRunTriggeredBySchema.options].sort()).toEqual([...ALL_SOURCES].sort());
  });
});

describe("TS unions include api_key (compile-time)", () => {
  it("RunTriggerSource and WorkflowRunTriggeredBy both accept 'api_key'", () => {
    const engineSource: RunTriggerSource = "api_key";
    const repoSource: WorkflowRunTriggeredBy = "api_key";
    expect(engineSource).toBe("api_key");
    expect(repoSource).toBe("api_key");

    // Prior values still assignable (regression guard).
    const manual: RunTriggerSource = "manual";
    const unknown: WorkflowRunTriggeredBy = "unknown";
    expect([manual, unknown]).toEqual(["manual", "unknown"]);
  });
});
