/**
 * Write smoke harness deps — provider connection probes.
 *
 * Extracted from writeHarnessDeps.ts (structure-only split; behavior unchanged).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";

/**
 * Provider connection facts for a write pilot — the 4-way classification inputs.
 * `dbConnected` = any active row on the account. `execUsable` = whether execution
 * can resolve the credential under the smoke user:
 *   - PERSONAL-class providers (trello, airtable, gmail, …) execute AS the
 *     workflow creator, so the smoke user must be the connector
 *     (`connected_by_user_id`); a co-member's row is connected-but-not-executable.
 *   - ACCOUNT-class providers (notion, slack, stripe, …) are account-shared, so
 *     execution does NOT filter by connector — `execUsable === dbConnected`.
 * Never collapses "no smoke target" into "not connected".
 */
export async function probeWriteConnection(
  accountId: string,
  userId: string,
  provider: string,
): Promise<{ dbConnected: boolean; execUsable: boolean }> {
  const dbConnected = (await getActiveForExecution(accountId, provider, null)) !== null;
  const execUsable = isPersonalCredentialProvider(provider)
    ? (await getActiveForExecution(accountId, provider, null, { connectedByUserId: userId })) !== null
    : dbConnected;
  return { dbConnected, execUsable };
}

/** @deprecated prefer probeWriteConnection — kept for the existing dev test. */
export async function isProviderConnectedForWrite(
  accountId: string,
  provider: string,
): Promise<boolean> {
  return (await getActiveForExecution(accountId, provider, null)) !== null;
}
