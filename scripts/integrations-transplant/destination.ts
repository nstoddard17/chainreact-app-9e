/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — real destination store.
 *
 * Writes go through the CANONICAL repository boundary
 * (`repositories/integrations.upsertActive` / `getActiveForExecution`,
 * `repositories/accounts`, `repositories/accountMemberships`), which use the
 * process-global service-role client. The CLI pins that global env to the
 * VERIFIED development project before this module is constructed; the
 * constructor re-asserts it (belt-and-braces) so a mis-wired process can
 * never hand the canonical write path a production URL.
 *
 * The ONLY direct table access here is the rollback pair (hard delete of a
 * failed fresh insert / column restore of a failed replacement) — narrow,
 * dev-only operations the canonical repository deliberately does not offer.
 */
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import {
  getActiveForExecution,
  listActiveByAccount,
  upsertActive,
} from "@/repositories/integrations";
import { getByIdServiceRole as getAccountByIdServiceRole } from "@/repositories/accounts";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import {
  TransplantRefusalError,
  type DestIntegrationRecord,
  type DestRowSnapshot,
  type DestUpsertInput,
  type TransplantDestinationStore,
} from "./types";

export function createDestinationStore(expected: {
  devRef: string;
  parseRefFromSupabaseUrl(url: string | undefined): string | null;
  protectedRefs: Record<string, string>;
}): TransplantDestinationStore {
  const globalRef = expected.parseRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (globalRef !== expected.devRef || expected.protectedRefs[globalRef ?? ""]) {
    throw new TransplantRefusalError(
      "destination_target_guard_failed",
      "process-global Supabase env is not pinned to the verified development project; refusing to construct the destination store.",
    );
  }

  return {
    async getAccountById(accountId) {
      const account = await getAccountByIdServiceRole(accountId);
      return account ? { id: account.id, deletionStatus: account.deletionStatus } : null;
    },

    async getMembershipRole(accountId, userId) {
      return getRoleServiceRole(accountId, userId);
    },

    async findActiveIntegration(accountId, provider, providerAccountId) {
      const rows = await listActiveByAccount(accountId);
      return (
        rows.find(
          (r) => r.provider === provider && r.providerAccountId === providerAccountId,
        ) ?? null
      );
    },

    async listActiveIntegrationsByProvider(accountId, provider) {
      const rows = await listActiveByAccount(accountId);
      return rows.filter((r) => r.provider === provider);
    },

    async upsertActive(input: DestUpsertInput): Promise<DestIntegrationRecord> {
      return upsertActive({
        accountId: input.accountId,
        connectedByUserId: input.connectedByUserId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        displayName: input.displayName,
        tokens: {
          accessTokenEncrypted: input.tokens.accessTokenEncrypted,
          refreshTokenEncrypted: input.tokens.refreshTokenEncrypted,
          accessTokenExpiresAt: input.tokens.accessTokenExpiresAt,
          scopes: input.tokens.scopes,
          extraCredentialsEncrypted: input.tokens.extraCredentialsEncrypted ?? null,
        },
        accountMetadata: input.accountMetadata,
      });
    },

    async readForExecution(accountId, provider, providerAccountId) {
      return getActiveForExecution(accountId, provider, providerAccountId);
    },

    async hardDeleteById(integrationId) {
      const supabase = getServiceRoleClient(
        `transplant rollback: hard delete integration ${integrationId} (dev)`,
      );
      const { error } = await supabase.from("integrations").delete().eq("id", integrationId);
      if (error) {
        throw new Error(`transplant rollback delete failed: ${error.message}`);
      }
    },

    async restoreRow(integrationId, snapshot: DestRowSnapshot) {
      const supabase = getServiceRoleClient(
        `transplant rollback: restore integration ${integrationId} (dev)`,
      );
      const { error } = await supabase
        .from("integrations")
        .update({
          display_name: snapshot.display_name,
          access_token_encrypted: snapshot.access_token_encrypted,
          refresh_token_encrypted: snapshot.refresh_token_encrypted,
          access_token_expires_at: snapshot.access_token_expires_at,
          extra_credentials_encrypted: snapshot.extra_credentials_encrypted,
          scopes: snapshot.scopes,
          account_metadata: snapshot.account_metadata,
          needs_reconnect_at: snapshot.needs_reconnect_at,
        })
        .eq("id", integrationId);
      if (error) {
        throw new Error(`transplant rollback restore failed: ${error.message}`);
      }
    },
  };
}
