/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — post-apply validation (`--validate`).
 *
 * Independent, READ-ONLY confirmation that a transplant batch landed correctly:
 * every destination row is read through the CANONICAL development listing +
 * execution paths (`repositories/integrations.listActiveByAccount` /
 * `getActiveForExecution`) and its credential is decrypted with the CANONICAL
 * env-bound `decryptToken` — i.e. exactly what the dev runtime does.
 *
 * Emits booleans and counts only: no plaintext, no ciphertext, no raw label.
 * Performs NO write, NO provider call, NO refresh.
 */
import { decryptToken } from "@/core/encryption/tokens";
import {
  getActiveForExecution,
  listActiveByAccount,
} from "@/repositories/integrations";
import { redactLabel } from "./redact";
import type { TransplantSourceReader } from "./types";

export interface ValidationRow {
  provider: string;
  destinationIntegrationIdRedacted: string;
  sourceIntegrationIdRedacted: string;
  ownedByDestAccount: boolean;
  provenanceIsDestUser: boolean;
  destinationIdIsNew: boolean;
  visibleViaCanonicalListing: boolean;
  resolvableViaExecutionPath: boolean;
  runtimeDecryptOk: boolean;
  sourceRowUnchanged: boolean;
  sourceStillActive: boolean;
  sourceNeedsReconnect: boolean;
}

export async function validateBatch(input: {
  source: TransplantSourceReader;
  destAccountId: string;
  destConnectedByUserId: string;
  /** From the apply artifact: the rows we expect to have created. */
  expected: Array<{ provider: string; sourceIntegrationId: string; destinationIntegrationId: string }>;
  /** Source rows captured BEFORE apply (for byte-for-byte comparison). */
  sourceBefore: Map<string, string>;
}): Promise<{ rows: ValidationRow[]; activeInDestAccount: number }> {
  const listed = await listActiveByAccount(input.destAccountId);
  const rows: ValidationRow[] = [];

  for (const item of input.expected) {
    const dest = listed.find((r) => r.id === item.destinationIntegrationId) ?? null;

    let resolvable = false;
    let runtimeDecryptOk = false;
    if (dest) {
      const viaExecution = await getActiveForExecution(
        input.destAccountId,
        dest.provider,
        dest.providerAccountId,
      );
      resolvable = viaExecution?.id === dest.id;
      if (viaExecution) {
        try {
          // Canonical env-bound decrypt = the dev runtime's own path. The
          // plaintext is discarded immediately; only the boolean escapes.
          runtimeDecryptOk = decryptToken(viaExecution.accessTokenEncrypted).length > 0;
        } catch {
          runtimeDecryptOk = false;
        }
      }
    }

    const [after] = await input.source.getIntegrationsByIds([item.sourceIntegrationId]);
    const before = input.sourceBefore.get(item.sourceIntegrationId);
    const afterJson = after ? JSON.stringify(after) : null;

    rows.push({
      provider: item.provider,
      destinationIntegrationIdRedacted: redactLabel(item.destinationIntegrationId),
      sourceIntegrationIdRedacted: redactLabel(item.sourceIntegrationId),
      ownedByDestAccount: dest?.accountId === input.destAccountId,
      provenanceIsDestUser: dest?.connectedByUserId === input.destConnectedByUserId,
      destinationIdIsNew: dest !== null && dest.id !== item.sourceIntegrationId,
      visibleViaCanonicalListing: dest !== null,
      resolvableViaExecutionPath: resolvable,
      runtimeDecryptOk,
      sourceRowUnchanged: before !== undefined && afterJson === before,
      sourceStillActive: after?.disconnected_at === null,
      sourceNeedsReconnect: after?.needs_reconnect_at !== null,
    });
  }

  return { rows, activeInDestAccount: listed.length };
}
