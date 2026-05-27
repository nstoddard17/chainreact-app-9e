/**
 * @jest-environment node
 *
 * Unit tests for `services/ai/builderAgent/persistenceDiagnostics.ts`
 * (Slice 4.AI-25 follow-up).
 *
 * The diagnostic is the central place to translate a PostgREST /
 * Postgres missing-table error into a dev-friendly "run supabase db
 * push" hint. Route + client paths both depend on consistent detection.
 */
import {
  buildPersistenceErrorBody,
  formatPersistenceErrorForDev,
  isMissingTableError,
  MIGRATION_HINT,
} from "@/core/ai/builderAgentPersistenceDiagnostics";

describe("isMissingTableError", () => {
  it("detects the PostgREST schema-cache message (Marcus's exact error)", () => {
    expect(
      isMissingTableError(
        "Could not find the table 'public.builder_agent_threads' in the schema cache",
      ),
    ).toBe(true);
  });

  it("detects the messages-table variant", () => {
    expect(
      isMissingTableError(
        "Could not find the table 'public.builder_agent_messages' in the schema cache",
      ),
    ).toBe(true);
  });

  it("detects bare `schema cache` mentions", () => {
    expect(
      isMissingTableError("PostgREST schema cache reports table missing"),
    ).toBe(true);
  });

  it("detects PGRST205", () => {
    expect(isMissingTableError("Error PGRST205: relation not found")).toBe(true);
  });

  it("detects Postgres SQLSTATE 42P01", () => {
    expect(
      isMissingTableError(
        "error: relation \"public.builder_agent_threads\" does not exist (SQLSTATE 42P01)",
      ),
    ).toBe(true);
  });

  it("detects the supabase-js `relation does not exist` shape", () => {
    expect(
      isMissingTableError("relation \"public.builder_agent_threads\" does not exist"),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isMissingTableError("network timeout")).toBe(false);
    expect(isMissingTableError("duplicate key violation")).toBe(false);
    expect(isMissingTableError("unauthorized")).toBe(false);
    expect(isMissingTableError("")).toBe(false);
    expect(isMissingTableError(undefined)).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

describe("formatPersistenceErrorForDev", () => {
  it("includes the migration hint when the error matches a missing-table pattern", () => {
    const formatted = formatPersistenceErrorForDev(
      new Error(
        "Could not find the table 'public.builder_agent_threads' in the schema cache",
      ),
      { route: "GET /api/workflows/[id]/ai/thread", op: "load" },
    );
    expect(formatted).toContain(
      "Could not find the table 'public.builder_agent_threads' in the schema cache",
    );
    expect(formatted).toContain(MIGRATION_HINT);
    expect(formatted).toContain("supabase db push");
    expect(formatted).toContain("route=GET /api/workflows/[id]/ai/thread");
    expect(formatted).toContain("op=load");
  });

  it("does NOT include the migration hint when the error is unrelated", () => {
    const formatted = formatPersistenceErrorForDev(new Error("network timeout"));
    expect(formatted).toBe("network timeout");
    expect(formatted).not.toContain("supabase db push");
  });

  it("handles non-Error throws", () => {
    expect(formatPersistenceErrorForDev("string error")).toBe("string error");
    expect(formatPersistenceErrorForDev({ code: 42 })).toContain("[object Object]");
  });

  it("omits the context prefix when no route/op given", () => {
    const formatted = formatPersistenceErrorForDev(new Error("x"));
    expect(formatted).toBe("x");
  });
});

describe("buildPersistenceErrorBody", () => {
  it("includes migrationHint on missing-table errors", () => {
    const body = buildPersistenceErrorBody(
      new Error(
        "Could not find the table 'public.builder_agent_messages' in the schema cache",
      ),
      "Failed to persist Builder Agent message.",
    );
    expect(body).toEqual({
      error: "Failed to persist Builder Agent message.",
      code: "PERSISTENCE_UNAVAILABLE",
      migrationHint: MIGRATION_HINT,
    });
  });

  it("omits migrationHint on unrelated errors", () => {
    const body = buildPersistenceErrorBody(
      new Error("network timeout"),
      "Failed to persist Builder Agent message.",
    );
    expect(body).toEqual({
      error: "Failed to persist Builder Agent message.",
      code: "PERSISTENCE_UNAVAILABLE",
    });
    expect(body).not.toHaveProperty("migrationHint");
  });

  it("never leaks the raw Postgres error into the user-facing `error` field", () => {
    // The raw Postgres error stays out of the response body's `error`
    // field — only `migrationHint` (a controlled string) ever surfaces
    // the dev-side context. This protects against accidentally exposing
    // table names / SQL state in production responses.
    const body = buildPersistenceErrorBody(
      new Error(
        "duplicate key value violates unique constraint \"builder_agent_threads_user_workflow_unique\"",
      ),
      "Failed to load Builder Agent thread.",
    );
    expect(body.error).toBe("Failed to load Builder Agent thread.");
    expect(JSON.stringify(body)).not.toContain("duplicate key");
    expect(JSON.stringify(body)).not.toContain("user_workflow_unique");
  });
});

describe("MIGRATION_HINT", () => {
  it("names both tables + recommends the supabase db push runbook", () => {
    expect(MIGRATION_HINT).toContain("public.builder_agent_threads");
    expect(MIGRATION_HINT).toContain("public.builder_agent_messages");
    expect(MIGRATION_HINT).toContain("supabase db push");
    expect(MIGRATION_HINT).toContain("supabase migration up");
    expect(MIGRATION_HINT).toContain("restart the dev server");
  });
});
