import { fleetioRequest } from "./_request";

/**
 * Fleetio `GET /accounts` wrapper (FLEETIO-1).
 *
 * The purpose-built identity/verification endpoint of API version 2025-05-05:
 * "information about the corresponding account(s) related to a given API key"
 * — it authenticates with the API key ALONE (no `Account-Token` header), and
 * each returned record carries the account's numeric `id` (durable), display
 * `name`, and `token` (the Account-Token value shown on the Manage API Keys
 * page / used as the URL slug).
 *
 * Connect-time verification (integrations/fleetio/auth.ts) calls this and
 * matches the user-entered Account-Token against `records[].token` — proving
 * BOTH credential halves with one lightweight read and yielding the durable
 * `providerAccountId` (`String(id)`) + `externalAccountLabel` (`name`).
 *
 * Only the fields we consume are typed; the raw response is never spread
 * anywhere (bounded-output discipline).
 */

export interface FleetioAccountRecord {
  /** Durable numeric account id — the integration row's providerAccountId. */
  id: number;
  /** Account display name (used as the connection label). */
  name: string;
  /** The Account-Token for this account. Secret-adjacent: never logged/stored in metadata. */
  token: string;
  /** Plan label when present (e.g. 'professional'). Non-secret. */
  plan?: string | null;
}

/** Envelope shape: current versions return `{ records: [...] }`; be tolerant of a bare array. */
interface AccountsResponseEnvelope {
  records?: unknown;
}

function toAccountRecord(value: unknown): FleetioAccountRecord | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "number" || typeof v.token !== "string") return null;
  return {
    id: v.id,
    name: typeof v.name === "string" ? v.name : `Fleetio account ${v.id}`,
    token: v.token,
    plan: typeof v.plan === "string" ? v.plan : null,
  };
}

/**
 * List the Fleetio accounts visible to `apiKey`. 401 → `Unauthorized401Error`
 * (invalid key); other failures per `_request.ts` mapping.
 */
export async function fleetioListAccounts(input: {
  apiKey: string;
}): Promise<readonly FleetioAccountRecord[]> {
  const raw = await fleetioRequest<AccountsResponseEnvelope | unknown[]>({
    apiKey: input.apiKey,
    accountToken: null, // documented: /accounts authenticates with the API key alone
    method: "GET",
    path: "/accounts",
  });
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as AccountsResponseEnvelope)?.records)
      ? ((raw as AccountsResponseEnvelope).records as unknown[])
      : [];
  return list
    .map(toAccountRecord)
    .filter((r): r is FleetioAccountRecord => r !== null);
}
