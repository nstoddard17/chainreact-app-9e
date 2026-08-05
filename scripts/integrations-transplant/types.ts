/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — shared contracts for the owner-operated
 * integration credential transplant utility (production test account → hosted
 * development account).
 *
 * Design invariants (enforced across the modules in this folder):
 *   - The SOURCE (production) is read-only: reachable only through the
 *     `TransplantSourceReader` port, whose real implementation wraps the
 *     Supabase client in a mutation-denying proxy (sourceReader.ts).
 *   - The DESTINATION is the hosted development project only: the process's
 *     global Supabase env is pinned to the verified dev project BEFORE any
 *     canonical repository import runs a query (cli.ts), so the canonical
 *     write path can never reach production.
 *   - Plaintext credentials live only in local variables inside the
 *     orchestrator; no port, report, log, or error type carries plaintext or
 *     ciphertext.
 */

// ─── Typed refusal / result vocabulary ───────────────────────────────────────

/** Preflight/refusal codes — every fail-closed exit names exactly one. */
export type TransplantRefusalCode =
  | "source_and_destination_refs_equal"
  | "destination_resolves_to_production"
  | "destination_target_guard_failed"
  | "source_ref_not_approved_production"
  | "source_url_unparseable"
  | "source_key_probe_failed"
  | "destination_key_probe_failed"
  | "source_encryption_key_missing"
  | "destination_encryption_key_missing"
  | "encryption_keys_identical"
  | "source_account_not_found"
  | "destination_account_not_found"
  | "destination_account_not_active"
  | "destination_user_not_member"
  | "destination_user_role_insufficient"
  | "source_integration_not_owned_by_source_account"
  | "source_integration_not_found"
  | "source_integration_not_active"
  | "provider_not_allowlisted"
  | "provider_not_registered"
  | "provider_unsupported"
  | "provider_rotation_risk_unacknowledged"
  | "owner_confirmation_missing_or_wrong"
  | "config_invalid"
  | "dry_run_fingerprint_mismatch"
  | "dry_run_artifact_missing"
  | "unresolved_conflicts"
  | "no_integrations_selected";

/** Per-integration outcome statuses (Phase 9 vocabulary). */
export type TransplantItemStatus =
  | "planned" // dry-run: would transplant
  | "verified" // apply: written + identity-verified + runtime decrypt proven
  | "refresh_unverified" // written + access verified, refresh/client compat NOT proven
  | "reconnect_required" // not written (or not durable): needs a real reconnect in dev
  | "unsupported" // provider classification forbids automatic transplant
  | "verification_failed" // probe rejected the credential; write rolled back / skipped
  | "verification_unsupported" // no read-only probe exists for the provider
  | "skipped" // conflict strategy 'skip' or explicit deselection
  | "conflict" // unresolved destination conflict (strategy 'fail')
  | "refused"; // typed preflight refusal at item level

export type TransplantItemReason =
  | "ok"
  | "existing_destination_row_same_connection"
  | "existing_destination_rows_ambiguous"
  | "provider_identity_mismatch"
  | "missing_required_scopes"
  | "access_token_expired_refresh_untested"
  | "probe_unauthorized"
  | "probe_network_error"
  | "oauth_client_compat_unattested"
  | "rotating_refresh_shared_with_production"
  | "runtime_decrypt_failed"
  | "destination_write_failed"
  | "rolled_back_after_failure"
  | "source_row_changed_during_apply"
  | "credential_undecryptable"
  | "provider_not_transplantable"
  | "no_probe_for_provider"
  | "skipped_by_strategy"
  | "aborted_after_earlier_failure"
  | "access_token_expired_no_refresh"
  | "provider_disabled"
  | "unknown_provider";

// ─── Classification (Phase 2) ────────────────────────────────────────────────

export type TransplantCategory = "A" | "B" | "C" | "D";

export type ProviderAuthType =
  | "oauth"
  | "token_ingest"
  | "token_paste"
  | "credential_paste"
  | "machine_credentials";

export interface ProviderTransplantClassification {
  provider: string;
  authType: ProviderAuthType;
  /** Highest-risk category that applies (A safest … D forbidden). */
  category: TransplantCategory;
  refreshable: boolean;
  /** Refresh/usage is bound to the OAuth client (or app API key) that minted it. */
  oauthClientBound: boolean;
  /**
   * Refresh tokens rotate (single-use or rolling): a dev refresh can invalidate
   * the token the production row still holds. Requires explicit config
   * acknowledgement before apply.
   */
  rotatingRefresh: boolean;
  /** Provider cannot discriminate multiple external accounts (e.g. constant id). */
  multiAccountRisk: boolean;
  /** Provider registers webhooks / polling state that must NOT be copied (Category C overlay). */
  hasTriggerLifecycleState: boolean;
  /** A read-only identity probe is implemented in verificationProbes.ts. */
  verificationSupported: boolean;
  /** Probe proves token acceptance but cannot confirm external account identity. */
  probeIdentityLimited?: boolean;
  reason: string;
}

// ─── Config (Phase 3) ────────────────────────────────────────────────────────

export type ConflictStrategy = "fail" | "skip" | "replace-after-verification";
export type VerificationMode = "strict" | "lenient";

/** Non-secret selection config loaded from the gitignored config file. */
export interface TransplantConfig {
  sourceProjectRef: string;
  destProjectRef: string;
  sourceAccountId: string;
  destAccountId: string;
  destConnectedByUserId: string;
  providerAllowlist: readonly string[];
  /** Optional narrowing to exact source integration row ids. */
  sourceIntegrationIds?: readonly string[];
  conflictStrategy: ConflictStrategy;
  verificationMode: VerificationMode;
  /**
   * Owner attestation that the DEV runtime uses the SAME provider OAuth
   * client/app credentials as production for these providers — required for a
   * client-bound provider to reach `verified` rather than `refresh_unverified`.
   */
  sharedOAuthClientProviders?: readonly string[];
  /** Owner acknowledgement for providers whose refresh tokens rotate. */
  acknowledgeRotationRiskProviders?: readonly string[];
  /** Exact typed owner confirmation sentence (validated verbatim). */
  ownerConfirmation: string;
}

export function expectedOwnerConfirmation(cfg: {
  sourceAccountId: string;
  destAccountId: string;
}): string {
  return (
    `I authorize transplanting the selected integrations from production ` +
    `account ${cfg.sourceAccountId} into development account ${cfg.destAccountId}.`
  );
}

// ─── Ports (mock boundaries) ─────────────────────────────────────────────────

/** Raw integrations row as read from the SOURCE database (snake_case). */
export interface SourceIntegrationRow {
  id: string;
  account_id: string;
  connected_by_user_id: string | null;
  provider: string;
  provider_account_id: string;
  display_name: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  extra_credentials_encrypted: string | null;
  scopes: string[];
  account_metadata: Record<string, unknown>;
  disconnected_at: string | null;
  needs_reconnect_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Read-only source port. The REAL implementation must expose no mutation
 * path (structurally tested); fakes in tests implement the same interface.
 */
export interface TransplantSourceReader {
  getAccountById(accountId: string): Promise<{ id: string } | null>;
  /** Active + inactive rows by id — ownership is checked by the orchestrator. */
  getIntegrationsByIds(ids: readonly string[]): Promise<SourceIntegrationRow[]>;
  listActiveIntegrationsByAccountAndProviders(
    accountId: string,
    providers: readonly string[],
  ): Promise<SourceIntegrationRow[]>;
}

/** Minimal destination integration record shape the orchestrator relies on. */
export interface DestIntegrationRecord {
  id: string;
  accountId: string;
  connectedByUserId: string | null;
  provider: string;
  providerAccountId: string;
  displayName: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  accessTokenExpiresAt: string | null;
  extraCredentialsEncrypted?: string | null;
  scopes: readonly string[];
  accountMetadata: Readonly<Record<string, unknown>>;
  disconnectedAt: string | null;
}

export interface DestUpsertInput {
  accountId: string;
  connectedByUserId: string;
  provider: string;
  providerAccountId: string;
  displayName: string | null;
  tokens: {
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string | null;
    accessTokenExpiresAt: number | null;
    scopes: readonly string[];
    extraCredentialsEncrypted?: string | null;
  };
  accountMetadata: Record<string, unknown>;
}

/** Columns restored on a rolled-back replacement. */
export interface DestRowSnapshot {
  display_name: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  extra_credentials_encrypted: string | null;
  scopes: string[];
  account_metadata: Record<string, unknown>;
  needs_reconnect_at: string | null;
}

export interface TransplantDestinationStore {
  getAccountById(
    accountId: string,
  ): Promise<{ id: string; deletionStatus: string } | null>;
  getMembershipRole(accountId: string, userId: string): Promise<string | null>;
  findActiveIntegration(
    accountId: string,
    provider: string,
    providerAccountId: string,
  ): Promise<DestIntegrationRecord | null>;
  listActiveIntegrationsByProvider(
    accountId: string,
    provider: string,
  ): Promise<DestIntegrationRecord[]>;
  /** Canonical write: insert, or in-place update of the same-tuple active row. */
  upsertActive(input: DestUpsertInput): Promise<DestIntegrationRecord>;
  /** Normal execution read path (proves the dev runtime can resolve the row). */
  readForExecution(
    accountId: string,
    provider: string,
    providerAccountId: string,
  ): Promise<DestIntegrationRecord | null>;
  /** Rollback of a freshly inserted row that failed post-write verification. */
  hardDeleteById(integrationId: string): Promise<void>;
  /** Rollback of an approved replacement: restore the prior column values. */
  restoreRow(integrationId: string, snapshot: DestRowSnapshot): Promise<void>;
}

export interface ProbeResult {
  ok: boolean;
  /** Provider-account identity extracted by the probe (compared, then redacted). */
  identity: string | null;
  /** True when `identity` is meaningful for a match against provider_account_id. */
  identitySupported: boolean;
  failure?: "unauthorized" | "network" | "malformed_response";
}

export interface CredentialPlaintext {
  accessToken: string;
  /** Extra credentials JSON (credential_paste providers), already parsed. */
  extras: Record<string, string> | null;
  /** Non-secret context a probe may need (e.g. Shopify shop domain). */
  providerAccountId: string;
  accountMetadata: Record<string, unknown>;
}

export type VerificationProbe = (
  creds: CredentialPlaintext,
) => Promise<ProbeResult>;

export interface TransplantCrypto {
  decryptSource(ciphertext: string): string;
  encryptDest(plaintext: string): string;
  /** The destination-runtime decrypt (canonical env-bound path in the CLI). */
  decryptDestRuntime(ciphertext: string): string;
}

/** Dependency bundle for the orchestrator (ports + registry facts + clock). */
export interface OrchestratorDeps {
  source: TransplantSourceReader;
  dest: TransplantDestinationStore;
  crypto: TransplantCrypto;
  getProbe(provider: string): VerificationProbe | null;
  classify(provider: string): ProviderTransplantClassification | null;
  providerInfo(provider: string): {
    registered: boolean;
    enabled: boolean;
    requiredScopes: readonly string[];
  };
  /** Redacted-only status logger (console in the CLI, capture in tests). */
  log(line: string): void;
  now(): number;
}

// ─── Reports (Phase 11/13 — redacted only) ───────────────────────────────────

export interface TransplantItemReport {
  sourceIntegrationId: string;
  provider: string;
  classification: TransplantCategory;
  /** Redacted external label (redact.ts) — never a full email/domain. */
  externalAccountLabel: string;
  /** Redacted provider account id. */
  providerAccountId: string;
  intendedAction: "insert" | "update-existing" | "skip" | "refuse";
  conflict: "none" | "same_connection_exists" | "ambiguous" | "single_account_provider_occupied";
  verificationSupport: "identity" | "token_only" | "none";
  status: TransplantItemStatus;
  reason: TransplantItemReason;
  destinationIntegrationId?: string;
  sourceUnchanged?: boolean;
  elapsedMs?: number;
}

export interface TransplantReport {
  operationId: string;
  mode: "dry-run" | "apply";
  fingerprint: string;
  sourceProjectRef: string;
  destProjectRef: string;
  sourceAccountId: string;
  destAccountId: string;
  destConnectedByUserId: string;
  conflictStrategy: ConflictStrategy;
  verificationMode: VerificationMode;
  items: TransplantItemReport[];
  counts: Record<string, number>;
  refusal?: { code: TransplantRefusalCode; detail: string };
}

/** Thrown for every fail-closed refusal. Message must stay secret-free. */
export class TransplantRefusalError extends Error {
  readonly code: TransplantRefusalCode;
  constructor(code: TransplantRefusalCode, detail: string) {
    super(`transplant refused [${code}]: ${detail}`);
    this.name = "TransplantRefusalError";
    this.code = code;
  }
}
