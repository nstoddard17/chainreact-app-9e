import { z } from "zod";

/**
 * Cross-layer contract for provider integrations.
 * Per docs/rules/provider-registry.md and oauth-dispatcher.md:
 *   - Each provider declares its capabilities, scopes, and OAuth shape via a
 *     ProviderManifest. The manifest IS the registry entry.
 *   - Provider id is the stable identifier from V1 (slack, gmail, discord, …)
 *     and matches the `integrations/<id>/` folder name.
 *
 * Provider-specific *action* and *trigger* schemas live next to the handlers
 * (integrations/<p>/actions/<action>.schema.ts), NOT in this file.
 */

export const ProviderIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/, "Provider ids are lowercase, dash- or underscore-separated.");

export const ProviderCapabilitySchema = z.enum([
  "oauth",
  "webhookTrigger",
  "pollingTrigger",
  "actions",
]);
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;

export const TokenScopeSchema = z.enum(["user", "workspace"]);
export type TokenScope = z.infer<typeof TokenScopeSchema>;

/**
 * Wire transport for the auth dance.
 *
 *   - `code_callback`: standard OAuth 2.0. Provider redirects to a V2
 *     server-side callback with `?code=…&state=…`. The dispatcher's
 *     `handleCallback` exchanges the code for tokens. Every existing V2
 *     provider through Slice 16 uses this.
 *
 *   - `token_ingest`: provider returns the token directly to the browser
 *     in the URL fragment (Trello's "client authorization" flow, and the
 *     shape used by various API-token providers). A V2 client page reads
 *     the fragment and POSTs the token + state to a server ingest
 *     endpoint, which calls the dispatcher's `handleTokenIngest`. The
 *     token never transits a provider-controlled server callback.
 */
export const AuthFlowSchema = z.enum(["code_callback", "token_ingest"]);
export type AuthFlow = z.infer<typeof AuthFlowSchema>;

export const ProviderManifestSchema = z
  .object({
    /** Stable id; matches the integrations/<id>/ folder name. */
    id: ProviderIdSchema,
    /** Display label for UI. */
    displayName: z.string().min(1),
    /** When false, existing tokens still work but new connect flows refuse. */
    isEnabled: z.boolean().default(true),
    /** Hidden from the default integrations list unless an env flag opts in. */
    isExperimental: z.boolean().default(false),
    /** Provider API version pinned by this manifest, if applicable. */
    apiVersion: z.string().optional(),
    /** Whether tokens are bound to a user or to a workspace/team. */
    tokenScope: TokenScopeSchema,
    /** Provider-specific OAuth flow names (e.g., 'v2', 'bot', 'user'). */
    oauthFlows: z.array(z.string()).default([]),
    /** Scopes declared by the provider; the only source of truth for scopes. */
    scopes: z.object({
      required: z.array(z.string()),
      optional: z.array(z.string()).default([]),
      deprecated: z.array(z.string()).default([]),
    }),
    capabilities: z.object({
      oauth: z.boolean().default(false),
      webhookTrigger: z.boolean().default(false),
      pollingTrigger: z.boolean().default(false),
      actions: z.boolean().default(false),
    }),
    /** How often the health-engine cron should poll this provider's health. */
    healthCheckIntervalMs: z.number().int().positive(),
    /** True if the provider's OAuth flow returns a refresh token. */
    refreshable: z.boolean().default(false),
    /**
     * Field in the provider's callback payload that uniquely identifies the
     * account (e.g., 'team_id' for Slack, 'workspace_id' for Notion).
     * Required for tokenScope='workspace'.
     */
    accountIdField: z.string().optional(),
    /**
     * Wire transport used by the dispatcher's connect dance. Defaults to
     * `code_callback` (every existing V2 provider through Slice 16) so
     * Slice-17-era additions don't need to touch existing manifests.
     * Token-ingest providers (Trello) declare `token_ingest`.
     */
    authFlow: AuthFlowSchema.default("code_callback"),
  })
  .superRefine((m, ctx) => {
    if (m.tokenScope === "workspace" && !m.accountIdField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountIdField"],
        message: "tokenScope='workspace' requires an accountIdField.",
      });
    }
    if (m.scopes.required.length === 0 && m.capabilities.oauth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scopes", "required"],
        message: "OAuth providers must declare at least one required scope.",
      });
    }
    if (m.authFlow === "token_ingest" && m.refreshable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refreshable"],
        message: "authFlow='token_ingest' providers cannot be refreshable.",
      });
    }
  });

export type ProviderManifest = z.infer<typeof ProviderManifestSchema>;

// ─── OAuth contracts ──────────────────────────────────────────────────────────
// Server-side only. Client code never imports types that hold token material.

/** Provider returns these tokens after a successful OAuth callback. */
export interface EncryptedTokens {
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  /** Epoch seconds, or null if the provider doesn't expose token expiry. */
  accessTokenExpiresAt: number | null;
  scopes: readonly string[];
}

/** Identifying fields about the connected account, parsed from the OAuth callback. */
export interface ProviderAccountInfo {
  providerAccountId: string;
  displayName: string | null;
  metadata: Record<string, unknown>;
}

/**
 * PKCE inputs persisted on the `oauth_states` row at connect time and
 * forwarded to the provider's callback handler at consume time. The
 * `codeVerifier` is the secret half — it lives only on the row, never in
 * the signed state JWT.
 */
export interface PkceInputs {
  codeVerifier: string;
  codeChallengeMethod: string;
}

/**
 * The PKCE challenge half — what gets embedded in the authorize URL.
 * Distinct from `PkceInputs` because the verifier (secret) does NOT go in
 * the URL. Providers that use PKCE return both halves from
 * `generatePkce()`; the dispatcher routes the verifier to `createState`
 * and the challenge to `buildAuthUrl`.
 */
export interface PkceChallenge {
  codeChallenge: string;
  codeChallengeMethod: string;
}

/**
 * Full output of a provider's PKCE generation step. Combines the verifier
 * (persisted server-side) and the challenge (embedded in the authorize URL).
 */
export interface PkceGeneration extends PkceInputs, PkceChallenge {}

/**
 * Per-provider per-tenant input captured at connect time.
 *
 * Slice 12 introduces this shape for **per-tenant-subdomain providers**
 * whose authorize / token URLs depend on user input (Shopify's
 * `https://{shop}.myshopify.com/admin/oauth/...`). The connect endpoint
 * accepts the hint as a JSON body field; the per-provider OAuth's
 * `validateProviderHint` enforces format; the dispatcher binds the
 * validated value into the signed OAuth state JWT so the callback can
 * compare it against any provider-echoed parameter (defense against
 * host-injection — see slice-12-shopify.md "OAuth model — per-shop
 * validation").
 *
 * String-valued only — the JWT payload is signed JSON and Record<string,
 * string> is the simplest shape that round-trips losslessly. Providers
 * that need richer input (typed enums, structured objects) can layer
 * parsers on top inside their own OAuth handlers.
 *
 * Non-tenant providers (every existing V2 provider as of Slice 12) ignore
 * the hint and the dispatcher passes `null` to their `buildAuthUrl` /
 * `handleCallback` 4th argument. Backward-compat is preserved because
 * the 4th argument is optional — function implementations with three
 * parameters satisfy the four-parameter interface via TypeScript's
 * structural-typing rules.
 */
export type ProviderHint = Readonly<Record<string, string>>;

/**
 * Per-account OAuth steering (Slice 4.APPS-RECONNECT). Passed to `buildAuthUrl`
 * ONLY during a per-account reconnect, so the provider's sign-in pre-selects /
 * forces the chooser onto the SPECIFIC account the user is reconnecting — they
 * can't accidentally re-authorize a different mailbox/workspace. Best-effort UX:
 * only providers that natively support account steering honor it (Google +
 * Microsoft families read `loginHint`/`forceAccountSelection`); every other
 * provider ignores the 5th `buildAuthUrl` argument. The HARD guarantee is the
 * callback identity-match in the dispatcher, not this hint.
 *
 * `loginHint` is the row's `provider_account_id` (an email for Google/Microsoft).
 * It is resolved server-side from the intended row and only ever travels to the
 * provider + the reconnecting user's own browser — never returned to the client.
 */
export interface AccountSteer {
  loginHint: string;
  forceAccountSelection: boolean;
}

/**
 * Per-provider OAuth implementation. Each provider in `integrations/<id>/oauth.ts`
 * exports an object that satisfies this shape. The generic dispatcher in
 * `services/oauth/dispatcher.ts` is the only caller.
 */
export interface ProviderOAuth {
  /**
   * Optional. Providers that use PKCE (Gmail, future PKCE-required
   * providers) implement this; the dispatcher calls it at connect time
   * and routes the verifier to `createState` (persisted on the
   * `oauth_states` row) AND the challenge into the call to `buildAuthUrl`.
   * Non-PKCE providers (Slack default v2) omit this method.
   */
  generatePkce?(): PkceGeneration;
  /**
   * Optional. Providers that accept per-tenant inputs at connect time
   * (Shopify shop subdomain, future Mailchimp `dc`, future per-cloud
   * Atlassian flows) implement this to validate format BEFORE the state
   * row is created — bad input fails at the start of the flow rather
   * than at the callback. Throws on invalid input; the dispatcher
   * surfaces the thrown error verbatim so the connect route can return
   * a typed 400. Non-tenant providers omit this method; the dispatcher
   * rejects connect attempts that pass `providerHint` to a provider
   * without `validateProviderHint`.
   */
  validateProviderHint?(hint: ProviderHint): void;
  /**
   * Optional. Per-tenant providers (Shopify) implement this so a per-account
   * RECONNECT can rebuild the tenant hint the authorize URL needs (the shop
   * domain) from the intended integration row — SERVER-SIDE, never from the
   * client (Slice 4.APPS-RECONNECT). Returns the validated hint, or `null` when
   * it can't be derived (corrupt row) so the dispatcher fails with a safe typed
   * error instead of leaking the stored value. Generic providers omit this; the
   * dispatcher derives no hint for them on reconnect.
   */
  deriveReconnectHint?(input: {
    providerAccountId: string;
    accountMetadata?: Record<string, unknown>;
  }): ProviderHint | null;
  /**
   * Builds the redirect URL the user is sent to. `state` is the signed
   * token from `createState()`. `pkce` is non-null only when the provider
   * declared `generatePkce` at connect time; non-PKCE providers receive
   * `null` and ignore it. `providerHint` is non-null only when the
   * connect call supplied a hint AND the provider's
   * `validateProviderHint` accepted it; other providers receive `null`
   * and ignore it.
   */
  buildAuthUrl(
    state: string,
    scopes: readonly string[],
    pkce: PkceChallenge | null,
    providerHint?: ProviderHint | null,
    /**
     * Per-account reconnect steering (Slice 4.APPS-RECONNECT). Non-null only
     * during a reconnect for a provider that supports steering; other providers
     * (and all normal Connect flows) receive `null` and ignore it. Optional so
     * existing 3-/4-arg implementations satisfy the interface structurally.
     */
    steer?: AccountSteer | null,
  ): string;
  /**
   * Exchanges the authorization code for tokens. `pkce` is non-null only for
   * providers that asked the dispatcher to issue a PKCE challenge at connect
   * time (manifest-driven). Non-PKCE providers receive `null` and ignore it.
   * `providerHint` is the same value passed into `buildAuthUrl` at connect
   * time, recovered from the signed state JWT — non-tenant providers
   * receive `null`.
   */
  handleCallback(
    code: string,
    state: string,
    pkce: PkceInputs | null,
    providerHint?: ProviderHint | null,
  ): Promise<{ tokens: EncryptedTokens; account: ProviderAccountInfo }>;
  /** Returns fresh tokens, or throws RefreshNotSupportedError on non-refreshable providers. */
  refreshToken(refreshToken: string): Promise<EncryptedTokens>;
  /** Best-effort token revocation at the provider; safe to call on disconnect. */
  revoke(token: string): Promise<void>;
}

/**
 * Per-provider token-ingest implementation. Used by manifests that declare
 * `authFlow: "token_ingest"`. Each provider in `integrations/<id>/auth.ts`
 * exports an object that satisfies this shape. The generic dispatcher in
 * `services/oauth/dispatcher.ts` is the only caller.
 *
 * Distinct from `ProviderOAuth` because the wire shape differs:
 *   - No `code` to exchange — the token arrives via the client ingest POST.
 *   - No `refreshToken` — these providers don't issue refresh tokens.
 *   - No `generatePkce` — PKCE protects a server-side code exchange that
 *     doesn't happen in this flow.
 *   - No `validateProviderHint` — token-ingest providers don't take
 *     per-tenant inputs; future hybrid providers would need a separate
 *     contract extension.
 *
 * Both `ProviderOAuth` and `ProviderTokenIngestAuth` providers continue to
 * write through `repositories/integrations.upsertActive` — every
 * persistence path remains dispatcher-canonical.
 */
export interface ProviderTokenIngestAuth {
  buildAuthUrl(state: string, scopes: readonly string[]): string;
  verifyAndIngestToken(input: {
    token: string;
    state: string;
  }): Promise<{ tokens: EncryptedTokens; account: ProviderAccountInfo }>;
  revoke(token: string): Promise<void>;
}

/**
 * Thrown by `verifyAndIngestToken()` when the provider rejects the
 * ingested token. Distinct from generic errors so the dispatcher and
 * route can map it to a typed 400 response. Message intentionally omits
 * the token value.
 */
export class TokenIngestVerificationError extends Error {
  readonly reason: string;
  constructor(provider: string, reason: string) {
    super(`Token ingest verification failed for '${provider}': ${reason}`);
    this.name = "TokenIngestVerificationError";
    this.reason = reason;
  }
}

/** Thrown by refreshToken() on providers whose flow does not return refresh tokens. */
export class RefreshNotSupportedError extends Error {
  constructor(provider: string) {
    super(`Provider '${provider}' does not support token refresh.`);
    this.name = "RefreshNotSupportedError";
  }
}
