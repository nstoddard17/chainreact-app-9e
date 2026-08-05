/** @jest-environment node */
/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — the SOURCE adapter must be
 * structurally incapable of mutating the production database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createReadOnlySupabaseFacade,
  SourceMutationForbiddenError,
} from "@/scripts/integrations-transplant/sourceReader";

/** Stub builder recording calls; mimics the PostgREST builder surface. */
function makeStubClient(): { client: SupabaseClient; calls: string[] } {
  const calls: string[] = [];
  function builder(): Record<string, unknown> {
    const b: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "in",
      "is",
      "order",
      "limit",
      "maybeSingle",
      "single",
      "insert",
      "update",
      "delete",
      "upsert",
    ]) {
      b[method] = (..._args: unknown[]) => {
        calls.push(method);
        return builder();
      };
    }
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return b;
  }
  const client = {
    from: (_table: string) => {
      calls.push("from");
      return builder();
    },
    rpc: (..._args: unknown[]) => {
      calls.push("rpc");
      return builder();
    },
    auth: { admin: {} },
    storage: {},
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("createReadOnlySupabaseFacade", () => {
  it("allows a plain select chain", async () => {
    const { client, calls } = makeStubClient();
    const facade = createReadOnlySupabaseFacade(client);
    await facade.from("integrations").select("id").eq("account_id", "x").is("disconnected_at", null);
    expect(calls).toEqual(["from", "select", "eq", "is"]);
  });

  it("denies insert / update / delete / upsert on the query builder", () => {
    const { client } = makeStubClient();
    const facade = createReadOnlySupabaseFacade(client);
    const q = facade.from("integrations") as unknown as Record<string, () => unknown>;
    for (const method of ["insert", "update", "delete", "upsert"]) {
      expect(() => q[method]).toThrow(SourceMutationForbiddenError);
    }
  });

  it("denies rpc / auth / storage / channel on the client facade", () => {
    const { client } = makeStubClient();
    const facade = createReadOnlySupabaseFacade(client) as unknown as Record<string, unknown>;
    for (const member of ["rpc", "auth", "storage", "channel", "functions"]) {
      expect(() => facade[member]).toThrow(SourceMutationForbiddenError);
    }
  });

  it("keeps chained builders wrapped (mutation after filters still denied)", () => {
    const { client } = makeStubClient();
    const facade = createReadOnlySupabaseFacade(client);
    const chained = facade.from("integrations").select("id").eq("a", "b") as unknown as Record<
      string,
      () => unknown
    >;
    expect(() => chained.update).toThrow(SourceMutationForbiddenError);
  });
});

describe("source adapter structure", () => {
  const src = readFileSync(
    path.join(process.cwd(), "scripts", "integrations-transplant", "sourceReader.ts"),
    "utf8",
  );

  it("exposes only read methods on the adapter surface", () => {
    // The TransplantSourceReader interface (types.ts) and the implementation
    // must contain no mutation verbs as method names.
    for (const forbidden of [
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\.upsert\(/,
      /\.rpc\(/,
    ]) {
      expect(src).not.toMatch(forbidden);
    }
  });

  it("never imports canonical repositories (which point at the DEV project)", () => {
    expect(src).not.toMatch(/@\/repositories\//);
  });
});
