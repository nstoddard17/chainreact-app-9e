import { Buffer } from "node:buffer";
import { createMtlsClient, type MtlsClientCredential } from "@/services/http/mtls";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  loadSecrets,
  readCachedToken,
  persistCachedToken,
} from "@/services/machineCredentials/store";
import { recordMachineCredentialAudit } from "@/repositories/machineCredentials";

/**
 * Generic OAuth 2.0 `client_credentials` token service over the mTLS transport.
 *
 * Provider-neutral (first consumer: ADP). Mints short-lived access tokens for a
 * server-to-server credential whose token endpoint requires a client certificate
 * (mutual TLS). Responsibilities:
 *
 *   - DB-backed token cache (never in-memory): reuse a stored token until it is
 *     near expiry, then re-mint. Mirrors the "no in-memory dedup" rule.
 *   - Single-flight: concurrent callers for the same (account, provider) collapse
 *     into ONE mint (parallel workflow runs must not stampede the token endpoint).
 *   - Typed, REDACTED errors: `MachineCredentialNotConnectedError` /
 *     `MachineTokenMintError` — never carry the client secret, cert, key, token,
 *     or raw provider body. The only provider detail surfaced is the standard
 *     OAuth2 `error` code (e.g. `invalid_client`), which is non-sensitive.
 *   - `withMachineToken`: get-token → call → on 401 re-mint once → retry, the
 *     machine-credential analogue of `refreshAndRetry`.
 *
 * The mTLS client is injectable so the mint path is unit-tested without sockets.
 */

/** How the client authenticates to the token endpoint. */
export type ClientCredentialsClientAuth = "basic" | "body";

export interface ClientCredentialsTokenConfig {
  tokenUrl: string;
  clientAuth: ClientCredentialsClientAuth;
  /** Space-delimited scopes, if the provider expects them. */
  scope?: string;
  /** Extra form params (provider-specific, non-secret). */
  extraParams?: Record<string, string>;
  /** Optional PEM CA bundle to verify the token endpoint against. */
  caPem?: string;
  /** Per-request timeout for the mint. Default 30s. */
  timeoutMs?: number;
  /** Fallback token TTL when the response omits `expires_in`. Default 3600s. */
  defaultTtlSeconds?: number;
}

export interface MachineAccessToken {
  accessToken: string;
  /** ISO-8601 expiry. */
  expiresAt: string;
}

export class MachineCredentialNotConnectedError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(`No active ${provider} machine credential is connected for this account.`);
    this.name = "MachineCredentialNotConnectedError";
    this.provider = provider;
  }
}

export type MachineTokenMintErrorCode = "http_error" | "invalid_response";

export class MachineTokenMintError extends Error {
  readonly code: MachineTokenMintErrorCode;
  /** Standard OAuth2 error code from the provider (non-secret), if any. */
  readonly providerErrorCode?: string;
  readonly status?: number;
  constructor(code: MachineTokenMintErrorCode, providerErrorCode?: string, status?: number) {
    super(
      `Failed to mint an access token (${code}${
        providerErrorCode ? `: ${providerErrorCode}` : ""
      }).`,
    );
    this.name = "MachineTokenMintError";
    this.code = code;
    if (providerErrorCode !== undefined) this.providerErrorCode = providerErrorCode;
    if (status !== undefined) this.status = status;
  }
}

export interface MachineTokenServiceDeps {
  /** Injected mTLS client (tests). Defaults to the real node:https transport. */
  mtls?: { request: ReturnType<typeof createMtlsClient>["request"] };
}

// ── Single-flight (in-process) ───────────────────────────────────────────────
const inFlight = new Map<string, Promise<MachineAccessToken>>();

function mintLockKey(accountId: string, provider: string, force: boolean): string {
  // Force-mints get a distinct key so a 401-driven re-mint never collapses onto
  // an in-flight cache-returning call.
  return `${accountId}:${provider}${force ? ":force" : ""}`;
}

function withMintLock(
  key: string,
  fn: () => Promise<MachineAccessToken>,
): Promise<MachineAccessToken> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

/** Extract the standard OAuth2 `error` code from a token-endpoint body. Safe:
 * OAuth2 error codes are a fixed lowercase vocabulary, never a secret. Never
 * returns `error_description` (which can echo request detail). */
function extractOAuthErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string" && /^[a-z_]{1,64}$/.test(parsed.error)) {
      return parsed.error;
    }
  } catch {
    // non-JSON body — nothing safe to extract
  }
  return undefined;
}

async function auditSafe(input: Parameters<typeof recordMachineCredentialAudit>[0]): Promise<void> {
  try {
    await recordMachineCredentialAudit(input);
  } catch {
    // advisory only
  }
}

async function mint(
  secrets: { clientId: string; clientSecret: string; certPem: string; keyPem: string },
  config: ClientCredentialsTokenConfig,
  now: Date,
  mtls: { request: ReturnType<typeof createMtlsClient>["request"] },
): Promise<MachineAccessToken> {
  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  if (config.scope) params.set("scope", config.scope);
  if (config.clientAuth === "body") {
    params.set("client_id", secrets.clientId);
    params.set("client_secret", secrets.clientSecret);
  }
  for (const [k, v] of Object.entries(config.extraParams ?? {})) params.set(k, v);

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  if (config.clientAuth === "basic") {
    const basic = Buffer.from(`${secrets.clientId}:${secrets.clientSecret}`).toString("base64");
    headers.authorization = `Basic ${basic}`;
  }

  const credential: MtlsClientCredential = {
    certPem: secrets.certPem,
    keyPem: secrets.keyPem,
    ...(config.caPem !== undefined ? { caPem: config.caPem } : {}),
  };

  const res = await mtls.request({
    method: "POST",
    url: config.tokenUrl,
    headers,
    body: params.toString(),
    credential,
    timeoutMs: config.timeoutMs ?? 30_000,
    // The token mint is side-effect-free → safe to retry transient failures.
    retries: 2,
    retryBaseDelayMs: 250,
    allowRetryOnNonIdempotent: true,
    now,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new MachineTokenMintError("http_error", extractOAuthErrorCode(res.body), res.status);
  }

  let parsed: { access_token?: unknown; expires_in?: unknown };
  try {
    parsed = JSON.parse(res.body);
  } catch {
    throw new MachineTokenMintError("invalid_response", "unparseable_body");
  }
  if (typeof parsed.access_token !== "string" || parsed.access_token.length === 0) {
    throw new MachineTokenMintError("invalid_response", "no_access_token");
  }
  const ttl =
    typeof parsed.expires_in === "number" && parsed.expires_in > 0
      ? parsed.expires_in
      : config.defaultTtlSeconds ?? 3600;
  return {
    accessToken: parsed.access_token,
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
  };
}

export interface GetMachineAccessTokenInput {
  accountId: string;
  provider: string;
  tokenConfig: ClientCredentialsTokenConfig;
  actorUserId?: string | null;
  now?: Date;
  /** Bypass the cache and mint a fresh token (used after a 401). */
  forceMint?: boolean;
}

/**
 * Return a valid access token for (accountId, provider) — from cache when fresh,
 * otherwise minted under the single-flight lock and cached. Throws
 * `MachineCredentialNotConnectedError` when no credential is connected, or
 * `MachineTokenMintError` / an `MtlsError` when the mint fails.
 */
export async function getMachineAccessToken(
  input: GetMachineAccessTokenInput,
  deps?: MachineTokenServiceDeps,
): Promise<MachineAccessToken> {
  const now = input.now ?? new Date();
  const mtls = deps?.mtls ?? createMtlsClient();
  const force = input.forceMint ?? false;

  const loaded = await loadSecrets(input.accountId, input.provider);
  if (!loaded) throw new MachineCredentialNotConnectedError(input.provider);

  if (!force) {
    const cached = readCachedToken(loaded.record, now);
    if (cached) return cached;
  }

  return withMintLock(mintLockKey(input.accountId, input.provider, force), async () => {
    // Re-load under the lock to pick up a token another caller just minted.
    const fresh = await loadSecrets(input.accountId, input.provider);
    if (!fresh) throw new MachineCredentialNotConnectedError(input.provider);
    if (!force) {
      const cached = readCachedToken(fresh.record, now);
      if (cached) return cached;
    }
    try {
      const minted = await mint(fresh.secrets, input.tokenConfig, now, mtls);
      await persistCachedToken({
        record: fresh.record,
        accessToken: minted.accessToken,
        expiresAt: minted.expiresAt,
      });
      await auditSafe({
        accountId: input.accountId,
        credentialId: fresh.record.id,
        provider: input.provider,
        actorUserId: input.actorUserId ?? null,
        event: "mint_succeeded",
        detail: { expiresAt: minted.expiresAt },
      });
      return minted;
    } catch (err) {
      await auditSafe({
        accountId: input.accountId,
        credentialId: fresh.record.id,
        provider: input.provider,
        actorUserId: input.actorUserId ?? null,
        event: "mint_failed",
        detail: {
          code: err instanceof MachineTokenMintError ? err.code : errName(err),
          providerErrorCode:
            err instanceof MachineTokenMintError ? err.providerErrorCode ?? null : null,
          status: err instanceof MachineTokenMintError ? err.status ?? null : null,
        },
      });
      throw err;
    }
  });
}

function errName(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string") return c;
  }
  return err instanceof Error ? err.name : "unknown";
}

/**
 * Run `apiCall` with a valid machine access token. On `Unauthorized401Error`
 * (the caller's API wrapper throws it on HTTP 401), force-mint a fresh token
 * ONCE and retry. The machine-credential analogue of `refreshAndRetry`.
 */
export async function withMachineToken<T>(
  input: GetMachineAccessTokenInput,
  apiCall: (accessToken: string) => Promise<T>,
  deps?: MachineTokenServiceDeps,
): Promise<T> {
  const { accessToken } = await getMachineAccessToken(input, deps);
  try {
    return await apiCall(accessToken);
  } catch (err) {
    if (!(err instanceof Unauthorized401Error)) throw err;
    const fresh = await getMachineAccessToken({ ...input, forceMint: true }, deps);
    return apiCall(fresh.accessToken);
  }
}

/** Test-only: clear in-flight mint locks between cases. */
export function __resetMintLocksForTests(): void {
  inFlight.clear();
}
