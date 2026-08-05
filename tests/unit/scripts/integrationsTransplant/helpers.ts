/**
 * Shared fixtures for the DEV-CONNECTION-TRANSPLANT-UTILITY-1 suites.
 *
 * Mocks exist ONLY at the sanctioned boundaries: the source/destination
 * Supabase stores (in-memory fakes implementing the real ports), the provider
 * HTTP probes, and the env/key loading. The orchestration and the AES-256-GCM
 * encryption are the REAL implementations.
 */
import { randomBytes, randomUUID } from "node:crypto";
import {
  encryptTokenWithKey,
  decryptTokenWithKey,
} from "@/core/encryption/tokens";
import type { EnvGuardDeps } from "@/scripts/integrations-transplant/preflight";
import type { OrchestratorDeps } from "@/scripts/integrations-transplant/orchestrator";
import type {
  DestIntegrationRecord,
  DestRowSnapshot,
  DestUpsertInput,
  ProviderTransplantClassification,
  SourceIntegrationRow,
  TransplantConfig,
  TransplantDestinationStore,
  TransplantSourceReader,
  ProbeResult,
  VerificationProbe,
} from "@/scripts/integrations-transplant/types";
import { expectedOwnerConfirmation } from "@/scripts/integrations-transplant/types";
import { classifyProvider } from "@/scripts/integrations-transplant/classification";

// ─── Environment fixtures (synthetic refs — never real project refs) ────────

export const PROD_REF = "prodprodprodprodprod";
export const DEV_REF = "devdevdevdevdevdev12";
export const SOURCE_KEY = randomBytes(32);
export const DEST_KEY = randomBytes(32);

export const SOURCE_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
export const DEST_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
export const DEST_USER_ID = "33333333-3333-4333-8333-333333333333";
export const SOURCE_USER_ID = "44444444-4444-4444-8444-444444444444";

export function makeConfig(over: Partial<TransplantConfig> = {}): TransplantConfig {
  const base = {
    sourceProjectRef: PROD_REF,
    destProjectRef: DEV_REF,
    sourceAccountId: SOURCE_ACCOUNT_ID,
    destAccountId: DEST_ACCOUNT_ID,
    destConnectedByUserId: DEST_USER_ID,
    providerAllowlist: ["gmail"],
    conflictStrategy: "fail" as const,
    verificationMode: "strict" as const,
    ...over,
  };
  return {
    ...base,
    ownerConfirmation: expectedOwnerConfirmation(base),
  };
}

export function makeEnv(
  over: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    CHAINREACT_DB_TARGET: "development",
    SUPABASE_DEV_PROJECT_REF: DEV_REF,
    SUPABASE_DEV_URL: `https://${DEV_REF}.supabase.co`,
    SUPABASE_DEV_SERVICE_ROLE_KEY: "dev-service-role-key-value",
    TRANSPLANT_SOURCE_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    TRANSPLANT_SOURCE_SERVICE_ROLE_KEY: "source-service-role-key-value",
    TRANSPLANT_SOURCE_TOKEN_ENCRYPTION_KEY: SOURCE_KEY.toString("base64"),
    TRANSPLANT_DEST_TOKEN_ENCRYPTION_KEY: DEST_KEY.toString("base64"),
    ...over,
  };
}

/**
 * Guard deps mirroring the CANONICAL env-target.mjs contract (the real module
 * is ESM-only and covered by its own spawn-based guard tests; the CLI is
 * structure-tested to import the real one).
 */
export function makeGuardDeps(over: Partial<EnvGuardDeps> = {}): EnvGuardDeps {
  const protectedRefs: Record<string, string> = { [PROD_REF]: "production" };
  return {
    resolveDbTarget(env, { expectedTarget }) {
      if (expectedTarget !== "development") {
        return { ok: false, target: null, ref: null, reason: "only development allowed" };
      }
      if (env.CHAINREACT_DB_TARGET !== expectedTarget) {
        return { ok: false, target: null, ref: null, reason: "CHAINREACT_DB_TARGET mismatch" };
      }
      const ref = env.SUPABASE_DEV_PROJECT_REF;
      if (!ref || !/^[a-z0-9]{20}$/.test(ref)) {
        return { ok: false, target: null, ref: null, reason: "invalid dev ref" };
      }
      if (protectedRefs[ref]) {
        return { ok: false, target: null, ref: null, reason: "protected ref denied" };
      }
      return { ok: true, target: "development", ref, reason: "ok" };
    },
    parseRefFromSupabaseUrl(url) {
      const m = url?.match(/https:\/\/([a-z0-9]{20})\.supabase\.co/);
      return m?.[1] ?? null;
    },
    productionRef: PROD_REF,
    protectedRefs,
    ...over,
  };
}

// ─── Source rows ─────────────────────────────────────────────────────────────

export function makeSourceRow(over: Partial<SourceIntegrationRow> = {}): SourceIntegrationRow {
  const accessPlain = over.provider === "fleetio" ? "fleetio-api-key-plain" : "source-access-token-plain-value";
  return {
    id: randomUUID(),
    account_id: SOURCE_ACCOUNT_ID,
    connected_by_user_id: SOURCE_USER_ID,
    provider: "gmail",
    provider_account_id: "marcus.test@gmail.com",
    display_name: "marcus.test@gmail.com",
    access_token_encrypted: encryptTokenWithKey(accessPlain, SOURCE_KEY),
    refresh_token_encrypted: encryptTokenWithKey("source-refresh-token-plain-value", SOURCE_KEY),
    access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    extra_credentials_encrypted: null,
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
    account_metadata: { emailAddress: "marcus.test@gmail.com" },
    disconnected_at: null,
    needs_reconnect_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...over,
  };
}

// ─── Fake stores (call-logging, in-memory) ───────────────────────────────────

export class FakeSourceReader implements TransplantSourceReader {
  readonly calls: string[] = [];
  constructor(
    public accounts: Array<{ id: string }> = [{ id: SOURCE_ACCOUNT_ID }],
    public rows: SourceIntegrationRow[] = [],
  ) {}

  async getAccountById(accountId: string) {
    this.calls.push(`getAccountById:${accountId}`);
    return this.accounts.find((a) => a.id === accountId) ?? null;
  }

  async getIntegrationsByIds(ids: readonly string[]) {
    this.calls.push(`getIntegrationsByIds:${ids.length}`);
    // Deep-copy so callers can't mutate the "database".
    return this.rows
      .filter((r) => ids.includes(r.id))
      .map((r) => JSON.parse(JSON.stringify(r)) as SourceIntegrationRow);
  }

  async listActiveIntegrationsByAccountAndProviders(
    accountId: string,
    providers: readonly string[],
  ) {
    this.calls.push(`listActive:${accountId}`);
    return this.rows
      .filter(
        (r) =>
          r.account_id === accountId &&
          providers.includes(r.provider) &&
          r.disconnected_at === null,
      )
      .map((r) => JSON.parse(JSON.stringify(r)) as SourceIntegrationRow);
  }
}

interface FakeDestRow extends DestIntegrationRecord {
  needsReconnectAt: string | null;
}

export class FakeDestinationStore implements TransplantDestinationStore {
  readonly mutationCalls: string[] = [];
  readonly readCalls: string[] = [];
  rows: FakeDestRow[] = [];
  accounts: Array<{ id: string; deletionStatus: string }> = [
    { id: DEST_ACCOUNT_ID, deletionStatus: "active" },
  ];
  memberships = new Map<string, string>([[`${DEST_ACCOUNT_ID}:${DEST_USER_ID}`, "owner"]]);

  async getAccountById(accountId: string) {
    this.readCalls.push(`getAccountById:${accountId}`);
    return this.accounts.find((a) => a.id === accountId) ?? null;
  }

  async getMembershipRole(accountId: string, userId: string) {
    this.readCalls.push(`getMembershipRole:${accountId}:${userId}`);
    return this.memberships.get(`${accountId}:${userId}`) ?? null;
  }

  async findActiveIntegration(accountId: string, provider: string, providerAccountId: string) {
    this.readCalls.push(`findActiveIntegration:${provider}`);
    return (
      this.rows.find(
        (r) =>
          r.accountId === accountId &&
          r.provider === provider &&
          r.providerAccountId === providerAccountId &&
          r.disconnectedAt === null,
      ) ?? null
    );
  }

  async listActiveIntegrationsByProvider(accountId: string, provider: string) {
    this.readCalls.push(`listActiveIntegrationsByProvider:${provider}`);
    return this.rows.filter(
      (r) => r.accountId === accountId && r.provider === provider && r.disconnectedAt === null,
    );
  }

  async upsertActive(input: DestUpsertInput): Promise<DestIntegrationRecord> {
    this.mutationCalls.push(`upsertActive:${input.provider}`);
    const existing = this.rows.find(
      (r) =>
        r.accountId === input.accountId &&
        r.provider === input.provider &&
        r.providerAccountId === input.providerAccountId &&
        r.disconnectedAt === null,
    );
    if (existing) {
      // Canonical semantics: in-place update, connected_by preserved, same id.
      existing.displayName = input.displayName;
      existing.accessTokenEncrypted = input.tokens.accessTokenEncrypted;
      existing.refreshTokenEncrypted = input.tokens.refreshTokenEncrypted;
      existing.accessTokenExpiresAt = input.tokens.accessTokenExpiresAt
        ? new Date(input.tokens.accessTokenExpiresAt * 1000).toISOString()
        : null;
      existing.extraCredentialsEncrypted = input.tokens.extraCredentialsEncrypted ?? null;
      existing.scopes = [...input.tokens.scopes];
      existing.accountMetadata = { ...input.accountMetadata };
      existing.needsReconnectAt = null;
      return existing;
    }
    const row: FakeDestRow = {
      id: randomUUID(),
      accountId: input.accountId,
      connectedByUserId: input.connectedByUserId,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      displayName: input.displayName,
      accessTokenEncrypted: input.tokens.accessTokenEncrypted,
      refreshTokenEncrypted: input.tokens.refreshTokenEncrypted,
      accessTokenExpiresAt: input.tokens.accessTokenExpiresAt
        ? new Date(input.tokens.accessTokenExpiresAt * 1000).toISOString()
        : null,
      extraCredentialsEncrypted: input.tokens.extraCredentialsEncrypted ?? null,
      scopes: [...input.tokens.scopes],
      accountMetadata: { ...input.accountMetadata },
      disconnectedAt: null,
      needsReconnectAt: null,
    };
    this.rows.push(row);
    return row;
  }

  async readForExecution(accountId: string, provider: string, providerAccountId: string) {
    this.readCalls.push(`readForExecution:${provider}`);
    return this.findActiveIntegration(accountId, provider, providerAccountId);
  }

  async hardDeleteById(integrationId: string) {
    this.mutationCalls.push(`hardDeleteById:${integrationId}`);
    this.rows = this.rows.filter((r) => r.id !== integrationId);
  }

  async restoreRow(integrationId: string, snapshot: DestRowSnapshot) {
    this.mutationCalls.push(`restoreRow:${integrationId}`);
    const row = this.rows.find((r) => r.id === integrationId);
    if (!row) throw new Error("restoreRow: row not found");
    row.displayName = snapshot.display_name;
    row.accessTokenEncrypted = snapshot.access_token_encrypted;
    row.refreshTokenEncrypted = snapshot.refresh_token_encrypted;
    row.accessTokenExpiresAt = snapshot.access_token_expires_at;
    row.extraCredentialsEncrypted = snapshot.extra_credentials_encrypted;
    row.scopes = [...snapshot.scopes];
    row.accountMetadata = { ...snapshot.account_metadata };
    row.needsReconnectAt = snapshot.needs_reconnect_at;
  }
}

// ─── Orchestrator deps ───────────────────────────────────────────────────────

export interface CountingCrypto {
  decryptSourceCalls: number;
  encryptDestCalls: number;
}

export function makeDeps(over: {
  source?: FakeSourceReader;
  dest?: FakeDestinationStore;
  probes?: Record<string, VerificationProbe>;
  classify?: (p: string) => ProviderTransplantClassification | null;
  providerInfo?: OrchestratorDeps["providerInfo"];
  log?: (line: string) => void;
  decryptDestRuntime?: (ct: string) => string;
} = {}): {
  deps: OrchestratorDeps;
  source: FakeSourceReader;
  dest: FakeDestinationStore;
  cryptoCounters: CountingCrypto;
  logs: string[];
} {
  const source = over.source ?? new FakeSourceReader();
  const dest = over.dest ?? new FakeDestinationStore();
  const logs: string[] = [];
  const cryptoCounters: CountingCrypto = { decryptSourceCalls: 0, encryptDestCalls: 0 };
  const deps: OrchestratorDeps = {
    source,
    dest,
    crypto: {
      decryptSource: (ct) => {
        cryptoCounters.decryptSourceCalls += 1;
        return decryptTokenWithKey(ct, SOURCE_KEY);
      },
      encryptDest: (pt) => {
        cryptoCounters.encryptDestCalls += 1;
        return encryptTokenWithKey(pt, DEST_KEY);
      },
      decryptDestRuntime:
        over.decryptDestRuntime ?? ((ct) => decryptTokenWithKey(ct, DEST_KEY)),
    },
    getProbe: (provider) => over.probes?.[provider] ?? null,
    classify: over.classify ?? classifyProvider,
    providerInfo:
      over.providerInfo ??
      ((provider) => ({
        registered: true,
        enabled: provider !== "adp",
        requiredScopes:
          provider === "gmail"
            ? [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
                "https://www.googleapis.com/auth/gmail.modify",
                "https://www.googleapis.com/auth/gmail.compose",
              ]
            : [],
      })),
    log: over.log ?? ((line) => logs.push(line)),
    now: () => Date.now(),
  };
  return { deps, source, dest, cryptoCounters, logs };
}

export function okProbe(identity: string): VerificationProbe {
  return async () => ({ ok: true, identity, identitySupported: true }) satisfies ProbeResult;
}
