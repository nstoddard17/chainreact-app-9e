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
/*
 *   - `token_paste`: like `token_ingest` in that the user supplies a
 *     long-lived per-user token directly (no code exchange), but the token
 *     arrives by the user PASTING it into a V2-hosted form rather than via a
 *     provider redirect + URL fragment. There is no provider authorize page:
 *     the connect dance redirects to a V2 paste page whose form POSTs
 *     { state, token } to the SAME ingest endpoint. Server contract is
 *     identical to `token_ingest` (state consume → verify → encrypt →
 *     upsert); only the client transport differs. Inaugural consumer: Eden
 *     (a pasted `eden_pat_` bearer token — docs/providers/eden/).
 */
/*
 *   - `credential_paste`: the user manually enters ONE OR MORE provider-defined
 *     named credentials (API key, account token, PAT pairs, …) into a
 *     ChainReact-owned form. Like `token_paste` there is no provider authorize
 *     page and no code exchange — but the transported secret is a typed SET of
 *     named fields (declared in the manifest's `credentialFields`), not a
 *     single opaque token, and the server operation is the dispatcher's
 *     `handleCredentialIngest` (NOT `handleTokenIngest` — the two paths are
 *     deliberately not cross-callable). Server contract mirrors token-ingest:
 *     state consume → verify against the provider API → encrypt → upsert.
 *     Non-refreshable by invariant. Inaugural consumer: Fleetio
 *     (`Authorization: Token <apiKey>` + `Account-Token` header pair —
 *     docs/providers/fleetio/). Rule doc: docs/rules/token-ingest-auth.md
 *     §"Credential-paste variant".
 */
/*
 *   - `machine_credentials`: server-to-server OAuth 2.0 `client_credentials`
 *     grant whose token endpoint AND API endpoints require a client certificate
 *     at the TLS layer (mutual TLS). There is NO user redirect and NO refresh
 *     token — access tokens are MINTED from a stored {client_id, client_secret,
 *     certificate, private key} set and re-minted on expiry. Connect is a
 *     credential-entry form (not an OAuth pop-up) handled OUTSIDE the OAuth
 *     dispatcher, by `services/machineCredentials/*` against the account-scoped
 *     encrypted machine-credential store. Inaugural (still-disabled) consumer:
 *     ADP (ADP Marketplace / API Central). These providers set
 *     `capabilities.oauth = false` — they do not use the redirect dispatcher.
 */
export const AuthFlowSchema = z.enum([
  "code_callback",
  "token_ingest",
  "token_paste",
  "credential_paste",
  "machine_credentials",
]);
export type AuthFlow = z.infer<typeof AuthFlowSchema>;

/** Auth flows that supply a non-refreshable per-user token directly (no code exchange). */
export const DIRECT_TOKEN_AUTH_FLOWS = ["token_ingest", "token_paste"] as const;

/**
 * Auth flows where the user manually ENTERS named credentials into a V2-owned
 * form (no provider redirect, no fragment, no code exchange). Deliberately NOT
 * part of `DIRECT_TOKEN_AUTH_FLOWS`: the dispatcher's `handleTokenIngest`
 * accepts only DIRECT_TOKEN flows and `handleCredentialIngest` accepts only
 * CREDENTIAL_PASTE flows, so neither path can reach the other's providers.
 */
export const CREDENTIAL_PASTE_AUTH_FLOWS = ["credential_paste"] as const;

/** Auth flows that mint tokens server-to-server (no user redirect, no refresh token). */
export const MACHINE_CREDENTIAL_AUTH_FLOWS = ["machine_credentials"] as const;

/** True when a provider uses the machine (client_credentials + mTLS) auth flow. */
export function isMachineCredentialAuthFlow(authFlow: AuthFlow): boolean {
  return (MACHINE_CREDENTIAL_AUTH_FLOWS as readonly string[]).includes(authFlow);
}

/**
 * One user-entered credential field for a `credential_paste` provider.
 * Declared in the manifest (data only) and rendered by the SHARED
 * provider-neutral credential form — the form never hardcodes any
 * provider's field names. `id` is the stable key the provider's
 * `verifyAndIngestCredentials` receives in its `credentials` record.
 */
export const CredentialFieldSchema = z.object({
  /** Stable field id (camelCase). Key of the submitted credentials record. */
  id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "Credential field ids are camelCase."),
  /** Input label shown above the field. */
  label: z.string().min(1),
  /** Secret fields render masked (password input + reveal control). */
  secret: z.boolean().default(true),
  /** Required fields block submit while empty. */
  required: z.boolean().default(true),
  /** Placeholder / example value (never a real credential). */
  placeholder: z.string().optional(),
  /** One-line helper under the input: where in the provider UI to find it. */
  help: z.string().optional(),
});
export type CredentialField = z.infer<typeof CredentialFieldSchema>;

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
    /**
     * Per-tenant connect-time input descriptor. Present ONLY for providers
     * whose authorize URL needs a user-supplied value captured BEFORE the
     * OAuth redirect — the `providerHint` (e.g. Shopify's `*.myshopify.com`
     * shop subdomain). The Apps UI renders a labelled prompt and sends the
     * entered value as `providerHint[hintKey]` to the connect route; the
     * provider's `validateProviderHint` is the authoritative validator, so
     * this is UI metadata only. Omitted for every non-tenant provider (the
     * dispatcher rejects a `providerHint` sent to a provider without
     * `validateProviderHint`, so the UI must only prompt when this is set).
     */
    connectInput: z
      .object({
        /** Key under which the entered value is sent — `providerHint[hintKey]`. */
        hintKey: z.string().min(1),
        /** Field label shown above the input. */
        label: z.string().min(1),
        /** Placeholder / example value. */
        placeholder: z.string().min(1),
        /** Optional helper line under the input. */
        help: z.string().optional(),
      })
      .optional(),
    /**
     * User-entered credential fields for `authFlow: "credential_paste"`
     * providers. REQUIRED (non-empty) for that flow and FORBIDDEN for every
     * other flow — the shared credential form renders exactly these fields.
     * Data only (labels/help strings); never a secret value.
     */
    credentialFields: z.array(CredentialFieldSchema).optional(),
    /**
     * Connect-page guidance for `credential_paste` providers: where the user
     * finds the credential values in the provider's own UI, plus any plan /
     * permission caveats. Rendered above the shared credential form. Data
     * only; forbidden outside `credential_paste`.
     */
    credentialGuide: z
      .object({
        /** One-or-two-sentence intro ("Connect using an API key from …"). */
        intro: z.string().min(1),
        /** Ordered "where to find it" steps rendered as a numbered list. */
        steps: z.array(z.string().min(1)).default([]),
        /** Optional caveat line (plan requirements, least-privilege advice). */
        note: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((m, ctx) => {
    if (m.tokenScope === "workspace" && !m.accountIdField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accountIdField"],
        message: "tokenScope='workspace' requires an accountIdField.",
      });
    }
    if (
      m.scopes.required.length === 0 &&
      m.capabilities.oauth &&
      !(CREDENTIAL_PASTE_AUTH_FLOWS as readonly string[]).includes(m.authFlow)
    ) {
      // credential_paste providers are exempt: their access level is the
      // provider-side user's ROLE (RBAC), not a negotiated scope set — an
      // empty scopes list is the honest declaration (e.g. Fleetio API keys).
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scopes", "required"],
        message: "OAuth providers must declare at least one required scope.",
      });
    }
    if ((DIRECT_TOKEN_AUTH_FLOWS as readonly string[]).includes(m.authFlow) && m.refreshable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refreshable"],
        message: `authFlow='${m.authFlow}' providers cannot be refreshable.`,
      });
    }
    const isCredentialPaste = (CREDENTIAL_PASTE_AUTH_FLOWS as readonly string[]).includes(
      m.authFlow,
    );
    if (isCredentialPaste) {
      // Same non-refreshable invariant as the direct-token flows: the pasted
      // credentials ARE the long-lived secret; there is nothing to refresh.
      if (m.refreshable) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["refreshable"],
          message: `authFlow='${m.authFlow}' providers cannot be refreshable.`,
        });
      }
      if (!m.credentialFields || m.credentialFields.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["credentialFields"],
          message:
            "credential_paste providers must declare at least one credentialFields entry.",
        });
      } else {
        const ids = new Set<string>();
        for (const f of m.credentialFields) {
          if (ids.has(f.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["credentialFields"],
              message: `Duplicate credential field id '${f.id}'.`,
            });
          }
          ids.add(f.id);
        }
      }
    } else {
      // Field/guide declarations outside credential_paste are a misconfiguration
      // (the shared credential form only serves credential_paste providers).
      if (m.credentialFields !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["credentialFields"],
          message: "credentialFields is only valid for authFlow='credential_paste'.",
        });
      }
      if (m.credentialGuide !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["credentialGuide"],
          message: "credentialGuide is only valid for authFlow='credential_paste'.",
        });
      }
    }
    if ((MACHINE_CREDENTIAL_AUTH_FLOWS as readonly string[]).includes(m.authFlow)) {
      // Machine (client_credentials + mTLS) providers mint tokens server-to-server:
      // no refresh token, and they do NOT use the OAuth redirect dispatcher.
      if (m.refreshable) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["refreshable"],
          message: `authFlow='${m.authFlow}' providers cannot be refreshable (tokens are minted, not refreshed).`,
        });
      }
      if (m.capabilities.oauth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["capabilities", "oauth"],
          message: `authFlow='${m.authFlow}' providers must not declare the 'oauth' capability (they use the machine-credential connect path, not the redirect dispatcher).`,
        });
      }
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
  /**
   * OPTIONAL — multi-credential providers only (`credential_paste`).
   * ONE AES-256-GCM ciphertext (core/encryption/tokens.ts) of the JSON object
   * `{ [credentialFieldId]: plaintextValue }` holding every NON-PRIMARY
   * credential the user entered. The provider designates one field as the
   * primary credential (stored in `accessTokenEncrypted` as usual — for
   * Fleetio that is the API key, which is literally the `Authorization`
   * header token); everything else lives here, encrypted as one blob because
   * the fields are only ever used together. `undefined`/`null` for every
   * single-credential provider — the repository writes NULL and existing
   * OAuth / token-ingest consumers are unaffected.
   */
  extraCredentialsEncrypted?: string | null;
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
 *
 * `TAuthUrl` (CS-1 MCP-AUTH): `buildAuthUrl` is synchronous for every
 * classic provider (the default, `string`), but MCP-catalog providers in
 * `discovered` endpoint mode resolve their authorize endpoint via RFC
 * 9728/8414 metadata at connect time — I/O — so they implement
 * `ProviderOAuth<string | Promise<string>>` (alias `AnyProviderOAuth`).
 * The dispatcher awaits the result either way; a sync implementation is
 * assignable to the async-capable variant (covariant return), so nothing
 * existing changes.
 */
export interface ProviderOAuth<
  TAuthUrl extends string | Promise<string> = string,
> {
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
   *
   * Returns `TAuthUrl` — `string` for classic providers; MCP-catalog
   * providers in `discovered` mode may return `Promise<string>` (endpoint
   * discovery is I/O — `integrations/_shared/mcp/oauthDiscovery.ts`). The
   * dispatcher awaits the result in both cases.
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
  ): TAuthUrl;
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
    /**
     * QUICKBOOKS-1 — the provider-redirect's OWN query params (minus `code` /
     * `state`), collected by the callback route and passed through the
     * dispatcher verbatim. Some providers deliver tenancy ONLY here
     * (QuickBooks `realmId` — not in the token response, not discoverable
     * from the token). Distinct from `providerHint`, which is a CONNECT-time
     * user-supplied hint recovered from the signed state. Optional so
     * existing 3-/4-arg implementations satisfy the interface structurally;
     * providers that don't need callback params ignore it.
     */
    callbackParams?: Readonly<Record<string, string>> | null,
  ): Promise<{ tokens: EncryptedTokens; account: ProviderAccountInfo }>;
  /** Returns fresh tokens, or throws RefreshNotSupportedError on non-refreshable providers. */
  refreshToken(refreshToken: string): Promise<EncryptedTokens>;
  /** Best-effort token revocation at the provider; safe to call on disconnect. */
  revoke(token: string): Promise<void>;
}

/**
 * A `ProviderOAuth` whose `buildAuthUrl` may be asynchronous. The dispatcher
 * registry accepts this shape; every classic (sync) implementation is
 * assignable to it. Introduced in CS-1 MCP-AUTH for MCP-catalog providers.
 */
export type AnyProviderOAuth = ProviderOAuth<string | Promise<string>>;

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
 * Per-provider credential-paste implementation. Used by manifests that declare
 * `authFlow: "credential_paste"`. Each provider in `integrations/<id>/auth.ts`
 * exports an object that satisfies this shape and registers it in the
 * dispatcher's `CREDENTIAL_PASTE_BY_PROVIDER`. The generic dispatcher is the
 * only caller.
 *
 * Distinct from `ProviderTokenIngestAuth` because the transported secret is a
 * typed SET of named fields (`credentials[fieldId]` per the manifest's
 * `credentialFields`), not a single token, and it flows through the
 * dispatcher's `handleCredentialIngest` — never `handleTokenIngest`.
 *
 *   - `buildAuthUrl` returns the V2-HOSTED credential form URL
 *     (`/integrations/credential-paste/<provider>?state=…`) — there is no
 *     provider authorize page.
 *   - `verifyAndIngestCredentials` MUST call a provider endpoint that proves
 *     the full credential set AND returns durable account info; encrypt every
 *     secret via `core/encryption/tokens.ts` before returning; and never echo
 *     a credential value into an error, log, or metadata field.
 *   - `revoke` receives the decrypted PRIMARY credential (best-effort; no-op
 *     when the provider has no revocation API).
 *
 * Persistence stays dispatcher-canonical: `repositories/integrations.upsertActive`.
 */
export interface ProviderCredentialPasteAuth {
  buildAuthUrl(state: string): string;
  verifyAndIngestCredentials(input: {
    credentials: Readonly<Record<string, string>>;
    state: string;
  }): Promise<{ tokens: EncryptedTokens; account: ProviderAccountInfo }>;
  revoke(token: string): Promise<void>;
}

/**
 * Thrown by `verifyAndIngestCredentials()` when the provider rejects the
 * entered credentials (or a required field is missing/mismatched). The
 * dispatcher and route map it to a typed 400. `reason` is a SAFE short
 * string — it never contains a credential value.
 */
export class CredentialVerificationError extends Error {
  readonly reason: string;
  constructor(provider: string, reason: string) {
    super(`Credential verification failed for '${provider}': ${reason}`);
    this.name = "CredentialVerificationError";
    this.reason = reason;
  }
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

/**
 * V2-READY-32 — thrown by a refreshable provider's `refreshToken()` when the
 * OAuth2 token-endpoint response PROVES the refresh grant itself is dead and
 * only user re-authorization can recover (RFC 6749 §5.2 `invalid_grant`:
 * refresh token revoked / expired / consent withdrawn / account removed).
 *
 * The dispatcher catches this to set `needs_reconnect_at` + notify the
 * connector once; it then re-throws so the run/action still fails with the
 * existing `refresh_failed` semantics. Transient failures (HTTP 429/5xx,
 * network, malformed body) and config-class OAuth2 errors (`invalid_client`,
 * `invalid_request`, …) MUST NOT throw this — they stay generic so a retry can
 * clear them and no reconnect signal is raised.
 *
 * NO-LEAK: carries ONLY the provider slug + the standard OAuth2 error code
 * (`invalid_grant`). NEVER the raw response body, token, refresh token, scope,
 * email, or provider account id.
 */
export class RefreshAuthRequiredError extends Error {
  readonly provider: string;
  readonly code: string;
  constructor(provider: string, code: string) {
    super(`Refresh requires re-authorization (${provider}): ${code}`);
    this.name = "RefreshAuthRequiredError";
    this.provider = provider;
    this.code = code;
  }
}

/**
 * OAuth2 token-endpoint error codes that DEFINITELY require user re-auth. Kept
 * deliberately MINIMAL: only `invalid_grant`, the RFC 6749 §5.2 code every
 * standard OAuth2 provider returns for a dead refresh token. Config-class codes
 * (`invalid_client` / `unauthorized_client` / `invalid_request` /
 * `invalid_scope`) are deployment/setup problems re-auth does NOT fix, so they
 * are excluded (stay generic, no reconnect mark). Transport (`HTTP <status>`)
 * and network failures never match here.
 */
const REFRESH_AUTH_REQUIRED_CODES: ReadonlySet<string> = new Set(["invalid_grant"]);

/** True when an extracted OAuth2 refresh error code means "user must reconnect". */
export function isRefreshAuthRequiredCode(code: string): boolean {
  return REFRESH_AUTH_REQUIRED_CODES.has(code);
}
