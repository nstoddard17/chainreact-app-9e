/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — Phase 5 read-only SOURCE adapter.
 *
 * The source is the PRODUCTION database. This adapter is the ONLY code path
 * allowed to touch it, and it is structurally incapable of mutation:
 *
 *   1. The Supabase client is wrapped in a deny-by-default Proxy: only `from`
 *      is reachable, and the query builder it returns only exposes an explicit
 *      allowlist of READ methods (select/filters/order/limit/single/await).
 *      `insert`, `update`, `delete`, `upsert`, `rpc`, `auth`, `storage`,
 *      `functions`, `channel` all throw `SourceMutationForbiddenError`.
 *   2. The adapter's public surface exposes only the three SELECTs the
 *      transplant needs (structure-tested).
 *
 * It deliberately does NOT import any canonical repository: those run through
 * the process-global service-role client, which the CLI pins to the DEV
 * project — the production client below exists only inside this closure.
 */
// DEV-CONNECTION-TRANSPLANT-UTILITY-1: the SOURCE (production) client must NOT
// come from repositories/ — the canonical repository client is process-global
// and is pinned to the DEV project by the CLI. This is the one sanctioned
// construction point for the read-only production client, and it is immediately
// wrapped in the mutation-denying facade below (structure- and behavior-tested
// in tests/unit/scripts/integrationsTransplant/sourceReader.test.ts).
// eslint-disable-next-line no-restricted-imports
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SourceIntegrationRow, TransplantSourceReader } from "./types";

export class SourceMutationForbiddenError extends Error {
  constructor(member: string) {
    super(
      `source adapter is read-only: '${String(member)}' is not permitted against the source database.`,
    );
    this.name = "SourceMutationForbiddenError";
  }
}

/** Query-builder members a read-only SELECT chain may use. */
const ALLOWED_BUILDER_MEMBERS = new Set<string | symbol>([
  "select",
  "eq",
  "neq",
  "in",
  "is",
  "order",
  "limit",
  "range",
  "maybeSingle",
  "single",
  "abortSignal",
  "throwOnError",
  "then",
  "catch",
  "finally",
]);

function wrapBuilder<T extends object>(builder: T): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !ALLOWED_BUILDER_MEMBERS.has(prop)) {
        // Non-function properties (e.g. internal fields) are still denied for
        // strings outside the allowlist — nothing in this adapter needs them.
        throw new SourceMutationForbiddenError(prop);
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = value.apply(target, args);
        // Chained builder calls return builders — keep them wrapped. Note the
        // PostgREST builder itself is a THENABLE (awaitable), so only real
        // Promise instances (from then/catch/finally) pass through unwrapped.
        if (result !== null && typeof result === "object" && !(result instanceof Promise)) {
          return wrapBuilder(result as object);
        }
        return result;
      };
    },
  });
}

/**
 * Wrap a Supabase client so ONLY `from(...).select(...)` read chains work.
 * Exported separately so tests can prove the denial behavior directly.
 */
export function createReadOnlySupabaseFacade(client: SupabaseClient): {
  from(table: string): ReturnType<SupabaseClient["from"]>;
} {
  return new Proxy({} as { from(table: string): ReturnType<SupabaseClient["from"]> }, {
    get(_target, prop) {
      if (prop !== "from") {
        throw new SourceMutationForbiddenError(String(prop));
      }
      return (table: string) => wrapBuilder(client.from(table));
    },
  });
}

const SOURCE_INTEGRATION_COLUMNS =
  "id, account_id, connected_by_user_id, provider, provider_account_id, " +
  "display_name, access_token_encrypted, refresh_token_encrypted, " +
  "access_token_expires_at, extra_credentials_encrypted, scopes, " +
  "account_metadata, disconnected_at, needs_reconnect_at, created_at, updated_at";

export function createSourceReader(input: {
  url: string;
  serviceRoleKey: string;
}): TransplantSourceReader {
  const facade = createReadOnlySupabaseFacade(
    createClient(input.url, input.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );

  return {
    async getAccountById(accountId: string) {
      const { data, error } = await facade
        .from("accounts")
        .select("id")
        .eq("id", accountId)
        .maybeSingle<{ id: string }>();
      if (error) throw new Error(`source accounts read failed: ${error.message}`);
      return data ?? null;
    },

    async getIntegrationsByIds(ids: readonly string[]) {
      if (ids.length === 0) return [];
      const { data, error } = await facade
        .from("integrations")
        .select(SOURCE_INTEGRATION_COLUMNS)
        .in("id", [...ids]);
      if (error) throw new Error(`source integrations read failed: ${error.message}`);
      return (data ?? []) as unknown as SourceIntegrationRow[];
    },

    async listActiveIntegrationsByAccountAndProviders(
      accountId: string,
      providers: readonly string[],
    ) {
      if (providers.length === 0) return [];
      const { data, error } = await facade
        .from("integrations")
        .select(SOURCE_INTEGRATION_COLUMNS)
        .eq("account_id", accountId)
        .in("provider", [...providers])
        .is("disconnected_at", null)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`source integrations list failed: ${error.message}`);
      return (data ?? []) as unknown as SourceIntegrationRow[];
    },
  };
}
