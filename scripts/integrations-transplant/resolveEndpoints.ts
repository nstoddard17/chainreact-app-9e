/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — `--resolve` mode: owner-authorized
 * READ-ONLY discovery of the transplant endpoints, so the owner can fill the
 * config file with verified ids instead of guessing.
 *
 *   source: production user (by email) → accounts they belong to → active
 *           integration COUNTS + PROVIDER NAMES (never a credential column)
 *   dest:   development user (by email) → their personal account + role
 *
 * Access shape (all fail-closed on environment identity first):
 *   - email → user id via the canonical `find_user_id_by_email` SECURITY
 *     DEFINER RPC (service-role-only SELECT on auth.users — the repo's
 *     sanctioned email lookup; avoids listing ANY other user)
 *   - everything else is PostgREST GETs selecting only:
 *     account_memberships(account_id, role) · accounts(id, name, type,
 *     deletion_status) · integrations(account_id, provider)
 *   - no credential/token/scope/metadata column is ever requested; nothing
 *     is decrypted; no write verb exists in this module.
 */
import type { EnvGuardDeps } from "./preflight";
import { TransplantRefusalError } from "./types";

interface HttpTarget {
  baseUrl: string;
  serviceRoleKey: string;
}

async function request(
  target: HttpTarget,
  method: "GET" | "POST",
  pathAndQuery: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${target.baseUrl}${pathAndQuery}`, {
    method,
    headers: {
      apikey: target.serviceRoleKey,
      Authorization: `Bearer ${target.serviceRoleKey}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    // Status only — never a response body (could echo request details).
    throw new Error(`${method} ${pathAndQuery.split("?")[0]} -> HTTP ${res.status}`);
  }
  return res.json();
}

async function findUserIdByEmail(target: HttpTarget, email: string): Promise<string> {
  // Canonical read-only lookup RPC (see repositories/users.ts) — POST is the
  // PostgREST calling convention for functions; the function itself is a
  // SELECT-only SECURITY DEFINER lookup.
  const result = await request(target, "POST", "/rest/v1/rpc/find_user_id_by_email", {
    p_email: email,
  });
  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`no user found for the given email`);
  }
  return result;
}

export interface ResolvedSourceAccount {
  accountId: string;
  name: string;
  type: string;
  role: string | null;
  activeIntegrations: number;
  providers: string[];
}

export interface ResolveResult {
  sourceUserId: string;
  sourceAccounts: ResolvedSourceAccount[];
  destUserId: string;
  destPersonalAccounts: Array<{
    accountId: string;
    name: string;
    role: string | null;
    deletionStatus: string;
  }>;
}

export async function resolveEndpoints(
  guard: EnvGuardDeps,
  env: Record<string, string | undefined>,
  input: { sourceEmail: string; destEmail: string },
): Promise<ResolveResult> {
  // Environment identity first — same fail-closed rules as the preflight.
  const sourceUrl = env.TRANSPLANT_SOURCE_SUPABASE_URL;
  const sourceKey = env.TRANSPLANT_SOURCE_SERVICE_ROLE_KEY;
  const sourceRef = guard.parseRefFromSupabaseUrl(sourceUrl);
  if (!sourceUrl || !sourceKey || !sourceRef) {
    throw new TransplantRefusalError(
      "source_url_unparseable",
      "TRANSPLANT_SOURCE_SUPABASE_URL / TRANSPLANT_SOURCE_SERVICE_ROLE_KEY must be set (.env.transplant.local).",
    );
  }
  if (sourceRef !== guard.productionRef) {
    throw new TransplantRefusalError(
      "source_ref_not_approved_production",
      "resolve: source must be the approved production project.",
    );
  }
  const devUrl = env.SUPABASE_DEV_URL;
  const devKey = env.SUPABASE_DEV_SERVICE_ROLE_KEY;
  const devRef = env.SUPABASE_DEV_PROJECT_REF;
  if (!devUrl || !devKey || !devRef || guard.parseRefFromSupabaseUrl(devUrl) !== devRef) {
    throw new TransplantRefusalError(
      "destination_target_guard_failed",
      "resolve: SUPABASE_DEV_URL / SUPABASE_DEV_SERVICE_ROLE_KEY / SUPABASE_DEV_PROJECT_REF must be set and agree.",
    );
  }
  if (guard.protectedRefs[devRef] || devRef === sourceRef) {
    throw new TransplantRefusalError(
      "destination_resolves_to_production",
      "resolve: destination is protected or equals the source.",
    );
  }

  const source: HttpTarget = { baseUrl: sourceUrl, serviceRoleKey: sourceKey };
  const dest: HttpTarget = { baseUrl: devUrl, serviceRoleKey: devKey };

  // ── Source ──
  const sourceUserId = await findUserIdByEmail(source, input.sourceEmail);
  const memberships = (await request(
    source,
    "GET",
    `/rest/v1/account_memberships?user_id=eq.${sourceUserId}&select=account_id,role`,
  )) as Array<{ account_id: string; role: string }>;

  const sourceAccounts: ResolvedSourceAccount[] = [];
  if (memberships.length > 0) {
    const idList = memberships.map((m) => m.account_id).join(",");
    const accounts = (await request(
      source,
      "GET",
      `/rest/v1/accounts?id=in.(${idList})&select=id,name,type`,
    )) as Array<{ id: string; name: string; type: string }>;
    const integrations = (await request(
      source,
      "GET",
      `/rest/v1/integrations?account_id=in.(${idList})&disconnected_at=is.null&select=account_id,provider`,
    )) as Array<{ account_id: string; provider: string }>;
    for (const account of accounts) {
      const rows = integrations.filter((i) => i.account_id === account.id);
      sourceAccounts.push({
        accountId: account.id,
        name: account.name,
        type: account.type,
        role: memberships.find((m) => m.account_id === account.id)?.role ?? null,
        activeIntegrations: rows.length,
        providers: [...new Set(rows.map((r) => r.provider))].sort(),
      });
    }
  }

  // ── Destination ──
  const destUserId = await findUserIdByEmail(dest, input.destEmail);
  const destAccounts = (await request(
    dest,
    "GET",
    `/rest/v1/accounts?owner_user_id=eq.${destUserId}&type=eq.personal&select=id,name,deletion_status`,
  )) as Array<{ id: string; name: string; deletion_status: string }>;
  const destMemberships = (await request(
    dest,
    "GET",
    `/rest/v1/account_memberships?user_id=eq.${destUserId}&select=account_id,role`,
  )) as Array<{ account_id: string; role: string }>;

  return {
    sourceUserId,
    sourceAccounts,
    destUserId,
    destPersonalAccounts: destAccounts.map((a) => ({
      accountId: a.id,
      name: a.name,
      role: destMemberships.find((m) => m.account_id === a.id)?.role ?? null,
      deletionStatus: a.deletion_status,
    })),
  };
}
