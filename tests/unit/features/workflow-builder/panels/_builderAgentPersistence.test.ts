/**
 * @jest-environment jsdom
 *
 * Unit tests for the client-side persistence helpers in
 * `features/workflow-builder/panels/_builderAgentPersistence.ts` (Slice
 * 4.AI-25 follow-up).
 *
 * The product UX (fail-open: no toast, no UI block) is unchanged. AI-25
 * follow-up adds a DEV-time hint to the console.warn when the
 * persistence call fails in a pattern that matches "AI-23 migration not
 * applied locally" — so a developer running the app for the first time
 * sees the `supabase db push` remediation in the browser console
 * instead of a bare PostgREST error.
 */
import {
  persistMessageBestEffort,
  warnPersistenceFailureForDev,
} from "@/features/workflow-builder/panels/_builderAgentPersistence";
import { MIGRATION_HINT } from "@/core/ai/builderAgentPersistenceDiagnostics";

const mockAppendBuilderAgentMessage = jest.fn();
jest.mock("@/lib/api/ai", () => ({
  appendBuilderAgentMessage: (...a: unknown[]) =>
    mockAppendBuilderAgentMessage(...a),
  AiApiError: class AiApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "AiApiError";
      this.status = status;
    }
  },
}));

import { AiApiError } from "@/lib/api/ai";

describe("warnPersistenceFailureForDev", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("emits a plain console.warn for unrelated errors (no migration hint)", () => {
    const err = new Error("network timeout");
    warnPersistenceFailureForDev("Something failed", err);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0]!;
    expect(args[0]).toBe("Something failed:");
    expect(args[1]).toBe(err);
    expect(args.length).toBe(2);
  });

  it("appends the migration hint when the raw error matches a schema-cache pattern", () => {
    const err = new Error(
      "Could not find the table 'public.builder_agent_threads' in the schema cache",
    );
    warnPersistenceFailureForDev("Builder Agent thread load failed", err);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0]!;
    expect(args[0]).toBe("Builder Agent thread load failed:");
    expect(args[1]).toBe(err);
    expect(args[2]).toContain(MIGRATION_HINT);
    expect(args[2]).toContain("supabase db push");
  });

  it("appends the migration hint when the error is an AiApiError with status 500 (route-side schema-cache 500)", () => {
    // The route returns a structured 500 with `migrationHint`, but the
    // `lib/api/ai.fetchJson` helper throws AiApiError carrying only the
    // server's `error` field as the message. Detection therefore uses the
    // HTTP status — any 500 from this surface is a dev-time hint candidate.
    const err = new AiApiError("Failed to load Builder Agent thread.", 500);
    warnPersistenceFailureForDev("Builder Agent thread load failed", err);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0]!;
    expect(args[2]).toContain(MIGRATION_HINT);
  });

  it("does NOT append the hint for non-500 AiApiError (401 / 404)", () => {
    warnPersistenceFailureForDev(
      "Builder Agent thread load failed",
      new AiApiError("Workflow not found.", 404),
    );
    const args = warnSpy.mock.calls[0]!;
    // Only [context, err] — no third hint arg.
    expect(args).toHaveLength(2);
  });

  it("inspects err.cause for missing-table patterns wrapped errors might carry", () => {
    const cause = new Error(
      "relation \"public.builder_agent_threads\" does not exist",
    );
    const wrapped = new Error("Generic wrapper");
    (wrapped as Error & { cause?: unknown }).cause = cause;
    warnPersistenceFailureForDev("Wrapped failed", wrapped);
    const args = warnSpy.mock.calls[0]!;
    expect(args[2]).toContain(MIGRATION_HINT);
  });

  it("is a no-op when console is undefined", () => {
    const originalConsole = global.console;
    // @ts-expect-error — testing the defensive guard
    global.console = undefined;
    expect(() =>
      warnPersistenceFailureForDev("x", new Error("y")),
    ).not.toThrow();
    global.console = originalConsole;
  });
});

describe("persistMessageBestEffort", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockAppendBuilderAgentMessage.mockReset();
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns the persisted record on success and does NOT warn", async () => {
    const record = {
      id: "m1",
      role: "user" as const,
      kind: "prompt" as const,
      content: "hi",
      safePayload: {},
      createdAt: "now",
    };
    mockAppendBuilderAgentMessage.mockResolvedValueOnce(record);
    const result = await persistMessageBestEffort("wf-1", {
      role: "user",
      kind: "prompt",
      content: "hi",
    });
    expect(result).toBe(record);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns null + warns with migration hint on schema-cache 500", async () => {
    mockAppendBuilderAgentMessage.mockRejectedValueOnce(
      new AiApiError("Failed to persist Builder Agent message.", 500),
    );
    const result = await persistMessageBestEffort("wf-1", {
      role: "user",
      kind: "prompt",
      content: "hi",
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0]!;
    expect(args[0]).toBe("Builder Agent message persistence failed:");
    expect(args[2]).toContain(MIGRATION_HINT);
  });

  it("returns null + plain warn on unrelated errors", async () => {
    mockAppendBuilderAgentMessage.mockRejectedValueOnce(
      new Error("network blip"),
    );
    const result = await persistMessageBestEffort("wf-1", {
      role: "user",
      kind: "prompt",
      content: "hi",
    });
    expect(result).toBeNull();
    const args = warnSpy.mock.calls[0]!;
    expect(args).toHaveLength(2);
  });
});
