import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PkceInputs, ProviderHint } from "@/contracts/integration";
import * as oauthStatesRepo from "@/repositories/oauthStates";

/**
 * Signed OAuth state tokens + DB-backed nonce table.
 *
 * Per docs/rules/oauth-dispatcher.md (Resolved Decisions):
 *   - HMAC-SHA256 signed compact token carrying userId, provider, nonce,
 *     expiresAt, requestedScopes.
 *   - 15-minute TTL.
 *   - Format: `<base64url(JSON(payload))>.<base64url(hmac)>`
 *   - "Signed short-lived state token + DB row keyed by nonce for PKCE/temp
 *     metadata. 15-min expiry. Row deleted after callback."
 *
 * Two layers, two purposes:
 *
 * 1. The signed JWT proves a state value originated server-side, carries the
 *    userId/provider/scopes that the dispatcher reads at callback time, and
 *    is what the OAuth provider sees + bounces back. `verifyState` is the
 *    pure (sync, no I/O) check for signature + expiry — useful in tests and
 *    anywhere that needs to inspect a token without consuming it.
 *
 * 2. The `oauth_states` row is what makes state one-time-use. Without it,
 *    an attacker who intercepts a state token (browser history leak, log
 *    slurp, malicious extension) within the 15-min window could replay it
 *    with their own provider OAuth code and have an integration row inserted
 *    against the victim's user_id. `consumeState` does the JWT check AND the
 *    atomic DB consume; the dispatcher uses this in the callback path.
 *
 * Provider-agnostic: `createState` accepts optional PKCE metadata that goes
 * into the DB row only (never into the JWT — the verifier is the secret half).
 * Slack default v2 doesn't pass any; Gmail / Google / Notion will.
 */

const STATE_TTL_SECONDS = 15 * 60;

export interface OAuthStatePayload {
  userId: string;
  /**
   * V2 account the new integration will be written to. Resolved at
   * connect time from the user's personal account (slice
   * 4.ACCOUNT-MODEL-6); when team/org accounts ship, the connect
   * route resolves the user's active account instead. Verified at
   * consume time so a tampered JWT can't redirect the new integration
   * to a different account.
   */
  accountId: string;
  provider: string;
  nonce: string;
  expiresAt: number;
  requestedScopes: readonly string[];
  /**
   * Optional per-tenant provider hint baked into the JWT payload at
   * connect time (Slice 12). Used by per-tenant-subdomain providers
   * (Shopify shop, future Mailchimp dc) to bind the user-validated
   * tenant identifier to the OAuth state nonce so the callback can
   * reject mismatched provider-echoed values (host-injection guard —
   * see `docs/slices/slice-12-shopify.md` "OAuth model — per-shop
   * validation").
   *
   * JWT-only — NOT persisted on the `oauth_states` DB row. Lives only
   * inside the signed-and-verified token bytes. This avoids a DB
   * migration AND keeps every provider hint round-trip co-located with
   * the same signature check that protects userId / provider / nonce.
   *
   * Non-tenant providers omit the field; existing OAuth flows are
   * unchanged.
   */
  providerHint?: ProviderHint;
}

export class InvalidStateError extends Error {
  constructor(reason: string) {
    super(`OAuth state validation failed: ${reason}`);
    this.name = "InvalidStateError";
  }
}

function getKey(): Buffer {
  const raw = process.env.OAUTH_STATE_SIGNING_KEY;
  if (!raw) throw new Error("OAUTH_STATE_SIGNING_KEY env var is not set.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length < 16) {
    throw new Error("OAUTH_STATE_SIGNING_KEY must decode to at least 16 bytes.");
  }
  return buf;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export interface CreateStateInput {
  userId: string;
  /** V2 account the new integration will be written to. See OAuthStatePayload.accountId. */
  accountId: string;
  provider: string;
  requestedScopes: readonly string[];
  /**
   * Optional PKCE metadata. Stored on the DB row only; NEVER serialized into
   * the signed JWT (the verifier is the secret half — putting it in the JWT
   * would be sent to the provider and defeat PKCE). Slack default v2 omits
   * this.
   */
  pkce?: {
    codeVerifier: string;
    codeChallengeMethod: string;
  };
  /**
   * Optional per-tenant provider hint (Slice 12). Baked INTO the signed
   * JWT payload, NOT written to the DB row. The dispatcher passes the
   * validated value here after `oauth.validateProviderHint?` accepts it.
   * Non-tenant providers omit the field.
   */
  providerHint?: ProviderHint;
}

/**
 * Validate the shape of a parsed providerHint candidate. The JWT round-trip
 * goes through `JSON.parse` so we re-validate the type at consume time —
 * a tampered payload that changed `providerHint: "string"` to a non-record
 * shape would otherwise leak a `string` where the contract promises a
 * `Record<string, string>`.
 */
function isValidProviderHint(value: unknown): value is ProviderHint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v !== "string") return false;
  }
  return true;
}

export async function createState(
  input: CreateStateInput,
): Promise<{ token: string; payload: OAuthStatePayload }> {
  if (!input.userId) throw new Error("createState: userId is required.");
  if (!input.accountId) throw new Error("createState: accountId is required.");
  if (!input.provider) throw new Error("createState: provider is required.");

  const payload: OAuthStatePayload = {
    userId: input.userId,
    accountId: input.accountId,
    provider: input.provider,
    nonce: randomBytes(16).toString("base64url"),
    expiresAt: nowSeconds() + STATE_TTL_SECONDS,
    requestedScopes: [...input.requestedScopes],
    ...(input.providerHint !== undefined
      ? { providerHint: { ...input.providerHint } }
      : {}),
  };

  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getKey()).update(data).digest("base64url");
  const token = `${data}.${sig}`;

  await oauthStatesRepo.create({
    nonce: payload.nonce,
    userId: payload.userId,
    provider: payload.provider,
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
    ...(input.pkce !== undefined
      ? {
          pkceCodeVerifier: input.pkce.codeVerifier,
          pkceCodeChallengeMethod: input.pkce.codeChallengeMethod,
        }
      : {}),
  });

  return { token, payload };
}

export function verifyState(token: string): OAuthStatePayload {
  if (typeof token !== "string" || !token.includes(".")) {
    throw new InvalidStateError("malformed token");
  }
  const dotIdx = token.indexOf(".");
  const data = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!data || !sig) throw new InvalidStateError("malformed token");

  const expectedSig = createHmac("sha256", getKey()).update(data).digest();
  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(sig, "base64url");
  } catch {
    throw new InvalidStateError("malformed signature");
  }
  if (
    expectedSig.length !== actualSig.length ||
    !timingSafeEqual(expectedSig, actualSig)
  ) {
    throw new InvalidStateError("signature mismatch");
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    throw new InvalidStateError("malformed payload");
  }

  if (typeof payload.expiresAt !== "number" || payload.expiresAt < nowSeconds()) {
    throw new InvalidStateError("expired");
  }
  if (!payload.userId || !payload.accountId || !payload.provider || !payload.nonce) {
    throw new InvalidStateError("missing required fields");
  }
  // Slice 12: providerHint is optional. When present, validate the shape
  // — a tampered JWT that changed it to a non-Record<string, string>
  // value would otherwise propagate untyped data into the per-provider
  // OAuth's handleCallback. (Tampering also fails the signature check
  // upstream; this is defense-in-depth against signing-key compromise.)
  if (payload.providerHint !== undefined && !isValidProviderHint(payload.providerHint)) {
    throw new InvalidStateError("malformed providerHint");
  }
  return payload;
}

/**
 * Result of a successful state consume: the verified JWT payload plus any
 * PKCE inputs persisted on the row at create time. `pkce` is null for
 * providers whose connect path didn't issue a PKCE challenge (Slack default
 * v2). PKCE-enabled providers receive a non-null `{ codeVerifier,
 * codeChallengeMethod }` to forward to their token endpoint.
 *
 * `providerHint` (Slice 12) is non-null only when the connect call supplied
 * a per-tenant hint (Shopify shop subdomain). Recovered directly from the
 * verified JWT payload — non-tenant providers receive `null`.
 */
export interface ConsumeStateResult {
  payload: OAuthStatePayload;
  pkce: PkceInputs | null;
  providerHint: ProviderHint | null;
}

/**
 * The dispatcher's callback path uses this. It does verifyState (signature +
 * expiry) AND atomically consumes the DB row in one step. A second call with
 * the same token throws InvalidStateError("already consumed or expired") —
 * that's the replay protection that the JWT alone cannot provide.
 *
 * Order matters: signature verification first (cheap, rejects forged tokens
 * without touching the DB); DB consume second. The atomic delete-if-fresh
 * makes concurrent consumes race-safe — only one wins, the other rejects.
 */
export async function consumeState(token: string): Promise<ConsumeStateResult> {
  const payload = verifyState(token);
  const row = await oauthStatesRepo.consumeByNonce(payload.nonce);
  if (!row) {
    throw new InvalidStateError("already consumed or expired");
  }
  if (row.userId !== payload.userId || row.provider !== payload.provider) {
    // The JWT and DB row disagree on who/what this state was for. Something
    // upstream is broken (key rotation mid-flow, DB tampering, …). Fail safe.
    throw new InvalidStateError("state row mismatch");
  }
  // createState writes both PKCE fields together (or neither). A
  // half-populated row indicates upstream corruption — treat as invalid and
  // ignore by returning pkce: null. This slice doesn't add a stricter mode;
  // a future provider that requires PKCE can throw on null pkce inside its
  // own handleCallback.
  const pkce =
    row.pkceCodeVerifier !== null && row.pkceCodeChallengeMethod !== null
      ? { codeVerifier: row.pkceCodeVerifier, codeChallengeMethod: row.pkceCodeChallengeMethod }
      : null;
  const providerHint = payload.providerHint ?? null;
  return { payload, pkce, providerHint };
}
