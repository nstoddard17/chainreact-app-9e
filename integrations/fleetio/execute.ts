import {
  getActiveForExecution,
  markNeedsReconnect,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { notifyReconnectNeeded } from "@/services/integrations/reconnectNotification";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { decryptFleetioCredentials, type FleetioCredentials } from "./credentials";

/**
 * Fleetio execution seam (FLEETIO-2).
 *
 * Fleetio is `credential_paste` + `refreshable: false` with TWO credentials, so
 * the OAuth `refreshAndRetry` wrapper doesn't fit (it decrypts ONE token and its
 * value is the refresh-retry cycle, which Fleetio cannot do). This helper is the
 * honest equivalent for a non-refreshable, two-credential provider — and it
 * reuses every canonical primitive:
 *
 *   1. `getActiveForExecution(accountId, "fleetio", providerAccountId)` — the
 *      SAME account-scoped integration lookup every handler/resolver uses. The
 *      integrations table is keyed on `account_id`, so a wrong account returns
 *      null (cross-account isolation is structural, never `connected_by_user_id`).
 *   2. `decryptFleetioCredentials(row)` — the established decoder. Both secrets
 *      are decrypted ONLY here, at the immediate provider-call boundary, and
 *      handed to `apiCall`; they never touch outputs, logs, errors, or metadata.
 *   3. On `Unauthorized401Error` (dead key) — Fleetio can't refresh, so this is
 *      a DURABLE reconnect signal: mark the row `needs_reconnect_at` (best-effort,
 *      one-shot) and throw `IntegrationActionRequiredError(refresh_not_supported)`,
 *      exactly the shape `refreshAndRetry`'s non-refreshable path throws — so the
 *      engine classifies it and the Apps page shows "reconnect Fleetio".
 *
 * Every OTHER error (403 role gap, 404, 429, 5xx, malformed JSON, timeout,
 * malformed credential blob) propagates verbatim — the engine classifies it, and
 * none of them are auth-expiry, so none mark reconnect.
 *
 * NOTE (multi-connection): `providerAccountId` defaults to null → the account's
 * single active Fleetio row (tokenScope "user" typically means one Fleetio
 * account per V2 account). Node-level selection among multiple connected Fleetio
 * accounts is deferred to a later slice; the resolver path resolves the same row.
 */
export interface RunFleetioApiCallInput<T> {
  /** V2 account that owns the workflow / integration (from handler input). */
  accountId: string;
  /** Provider-side discriminator; null selects the account's single Fleetio row. */
  providerAccountId?: string | null;
  /** The principal outbound call. Receives BOTH decrypted credentials. */
  apiCall: (credentials: FleetioCredentials) => Promise<T>;
}

async function markReconnectBestEffort(row: IntegrationRecord): Promise<void> {
  try {
    const firstMark = await markNeedsReconnect(row.id);
    if (firstMark) await notifyReconnectNeeded(row);
  } catch {
    // swallow — surfacing the original run failure matters more.
  }
}

export async function runFleetioApiCall<T>(input: RunFleetioApiCallInput<T>): Promise<T> {
  if (!input.accountId) throw new Error("runFleetioApiCall: accountId is required.");

  const row = await getActiveForExecution(
    input.accountId,
    "fleetio",
    input.providerAccountId ?? null,
  );
  if (!row) {
    throw new Error(
      `runFleetioApiCall: no active Fleetio integration for account ${input.accountId}. Connect Fleetio to run this workflow.`,
    );
  }

  // Decrypt BOTH credentials at the immediate call boundary (never earlier,
  // never stored). A malformed blob throws FleetioCredentialShapeError → the
  // engine classifies it (fatal integration error), never a partial call.
  const credentials = decryptFleetioCredentials(row);

  try {
    return await input.apiCall(credentials);
  } catch (err) {
    if (err instanceof Unauthorized401Error) {
      // Non-refreshable dead credential → durable reconnect-required.
      await markReconnectBestEffort(row);
      throw new IntegrationActionRequiredError({
        accountId: input.accountId,
        provider: "fleetio",
        providerAccountId: input.providerAccountId ?? null,
        reason: "refresh_not_supported",
        cause: err,
      });
    }
    throw err;
  }
}
