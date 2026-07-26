/**
 * Resolver-failure recovery classification (REACT-AGENT-RESOLVER-RECOVERY-1).
 *
 * A provider option resolver can fail for very different reasons — the connection was never made,
 * the token was rejected, the credential belongs to someone else, the provider is having a bad
 * minute, the account genuinely has nothing to list. Before this module the React Agent's
 * "Finish these details before applying" panel collapsed ALL of them into one dead string
 * ("Couldn't load options. You can finish this in the step editor.") with no working action, which
 * left a required field non-editable and the drafted workflow impossible to complete.
 *
 * This module is the SINGLE place that decides, for a given resolver state:
 *   - what we honestly tell the user,
 *   - whether retrying can plausibly help,
 *   - whether the fix is a reconnect,
 *   - whether the user may deliberately type the provider ID instead.
 *
 * Pure + framework-free (core/ may import only contracts/): no React, no fetch, no store, no
 * provider branches. Every renderer that shows a resolver-backed field uses it so Typeform and
 * Mailchimp — and every other provider — recover identically.
 *
 * SAFETY: the only provider-derived text this module composes is the PUBLIC option-source key
 * (`typeform:forms` → "Typeform forms") and a caller-supplied display label. Sanitized server
 * messages are passed through verbatim by the caller when they add information (e.g. "…missing a
 * required permission"); raw provider bodies, tokens, scopes, account ids, and stack traces never
 * reach here because the options route never returns them (`services/options/types.ts`).
 */

/**
 * Loading-state discriminant, mirroring `UseOptionsSourceState["status"]` for the non-ready arms.
 * Declared locally (not imported) because core/ may not import features/ or lib/; the caller
 * passes its status through and TypeScript checks assignability at the call site.
 */
export type OptionsRecoveryStatus =
  | "error"
  | "disconnected"
  | "needs-reconnect"
  | "owner-gated"
  | "owner-must-connect"
  | "empty";

/** Mirror of `OptionsSourceErrorCode` / `OptionsApiErrorCode`. Same reason as above. */
export type OptionsRecoveryErrorCode =
  | "UNAUTHENTICATED"
  | "INTEGRATION_DISCONNECTED"
  | "SOURCE_NOT_FOUND"
  | "MISSING_DEPENDENCY"
  | "PROVIDER_ERROR"
  | "PROVIDER_REAUTH_REQUIRED"
  | "SERVER_ERROR"
  | "NOT_WORKFLOW_OWNER"
  | "OWNER_MUST_CONNECT"
  | "UNKNOWN";

/**
 * The distinct user-facing situations. Deliberately NOT one bucket — each maps to different copy
 * and a different set of working actions.
 */
export type OptionsRecoveryKind =
  /** No integration row for this provider on the resolving account. */
  | "connection-missing"
  /** The row exists but the provider rejected the token — auth, revocation, or a missing scope. */
  | "reconnect-required"
  /** A personal-credential provider whose connection belongs to the workflow owner, not this user. */
  | "owner-managed"
  /** The session is gone. */
  | "sign-in-required"
  /** The provider answered, but not usefully (4xx/5xx/rate limit) — transient by assumption. */
  | "provider-unavailable"
  /** ChainReact or the network failed the request. */
  | "request-failed"
  /** ChainReact cannot enumerate this resource at all (unknown/unregistered source). */
  | "not-available"
  /** A `dependsOn` parent has no value yet, so there is nothing to list. */
  | "parent-required"
  /** The call succeeded and the account genuinely has none of this resource. */
  | "no-results";

export interface OptionsRecoveryInput {
  readonly status: OptionsRecoveryStatus;
  /** Present on `status: "error"`. */
  readonly code?: OptionsRecoveryErrorCode;
  /** The `<provider>:<resource>` option-source key, e.g. `typeform:forms`. */
  readonly source?: string;
  /** Display name for the provider (e.g. "Typeform"). Falls back to a humanized source prefix. */
  readonly providerLabel?: string;
  /** The field's label (e.g. "Form") — used when the source key can't name the resource. */
  readonly fieldLabel?: string;
  /** `missingDependency` from the route, for `MISSING_DEPENDENCY`. */
  readonly missingDependency?: string;
  /**
   * The route's already-sanitized, caller-friendly message. Shown as the detail line when it adds
   * information the generic copy can't (which permission is missing, who owns the connection).
   * Never a provider body — the options contract forbids that.
   */
  readonly serverMessage?: string;
}

export interface OptionsRecoveryDescriptor {
  readonly kind: OptionsRecoveryKind;
  /** One honest sentence naming what failed. Never "Couldn't load options." */
  readonly headline: string;
  /** Optional second line explaining the fix. */
  readonly detail?: string;
  /** True when issuing the same request again could plausibly succeed. */
  readonly canRetry: boolean;
  /** True when the fix is (re)connecting the provider — the renderer deep-links to Apps. */
  readonly canReconnect: boolean;
  /** Provider slug for the reconnect deep link. Only set when `canReconnect`. */
  readonly reconnectProvider?: string;
  /**
   * True when typing the provider ID by hand is a legitimate way out. False only where a typed ID
   * cannot help: the parent field isn't chosen yet (nothing identifies the resource), or the
   * session is gone (nothing would persist).
   */
  readonly canEnterManually: boolean;
}

/** `typeform:forms` → `typeform`. Returns `undefined` when the key isn't in `provider:resource` form. */
export function providerFromOptionsSource(source: string | undefined): string | undefined {
  if (!source) return undefined;
  const idx = source.indexOf(":");
  if (idx <= 0) return undefined;
  return source.slice(0, idx);
}

/**
 * `typeform:forms` → `forms`; `hubspot:subscription_properties` → `subscription properties`.
 * The resource half of a registered option-source key is public builder metadata (it appears in
 * every provider's `.meta.ts`), so composing it into user copy leaks nothing.
 */
export function resourceNounFromOptionsSource(source: string | undefined): string | undefined {
  if (!source) return undefined;
  const idx = source.indexOf(":");
  if (idx < 0 || idx === source.length - 1) return undefined;
  const resource = source.slice(idx + 1).trim();
  if (resource.length === 0) return undefined;
  return resource.replace(/_/g, " ");
}

/** `microsoft-outlook` → `Microsoft Outlook`. Only used when no display label was supplied. */
export function humanizeProviderSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function names(input: OptionsRecoveryInput): { provider: string; resource: string } {
  const slug = providerFromOptionsSource(input.source);
  const provider =
    input.providerLabel && input.providerLabel.trim().length > 0
      ? input.providerLabel.trim()
      : slug
        ? humanizeProviderSlug(slug)
        : "this app";
  const resource =
    resourceNounFromOptionsSource(input.source) ??
    (input.fieldLabel && input.fieldLabel.trim().length > 0
      ? `${input.fieldLabel.trim().toLowerCase()} choices`
      : "choices");
  return { provider, resource };
}

/**
 * Map a non-ready resolver state to the honest recovery descriptor.
 *
 * NOTE ON TIMEOUTS: the options contract has no distinct timeout code today — a stalled request
 * surfaces as the transport failure (`UNKNOWN`) and is reported as "we couldn't reach ChainReact",
 * which is true. We deliberately do NOT invent a "request timed out" state we cannot actually
 * observe; inventing one would be the same dishonesty as the dead-end string this replaces.
 */
export function classifyOptionsRecovery(
  input: OptionsRecoveryInput,
): OptionsRecoveryDescriptor {
  const { provider, resource } = names(input);
  const providerSlug = providerFromOptionsSource(input.source);
  const cantLoad = `We couldn't load your ${provider} ${resource}.`;

  const reconnect = (
    kind: OptionsRecoveryKind,
    headline: string,
    detail: string,
  ): OptionsRecoveryDescriptor => ({
    kind,
    headline,
    detail,
    canRetry: true,
    canReconnect: true,
    ...(providerSlug ? { reconnectProvider: providerSlug } : {}),
    canEnterManually: true,
  });

  switch (input.status) {
    case "disconnected":
      return reconnect(
        "connection-missing",
        `${provider} isn't connected yet.`,
        `Connect ${provider}, then load your ${resource} again.`,
      );

    case "owner-must-connect":
      return reconnect(
        "connection-missing",
        `${provider} isn't connected yet.`,
        `This step runs on your ${provider} connection. Connect it, then load your ${resource} again.`,
      );

    case "needs-reconnect":
      // Covers BOTH a rejected/revoked token and a missing OAuth scope — the resolvers classify
      // both as PROVIDER_REAUTH_REQUIRED and the server's sanitized message says which, so we show
      // it verbatim rather than guessing.
      return reconnect(
        "reconnect-required",
        `Your ${provider} connection needs to be renewed.`,
        input.serverMessage ??
          `Reconnect ${provider} to load your ${resource} again.`,
      );

    case "owner-gated":
      // A non-owner editing a personal-credential step. Retrying cannot change the answer and we
      // must never fetch the owner's resource labels — but the user is not trapped: they may still
      // type an ID they already know, and the step runs on the owner's connection either way.
      return {
        kind: "owner-managed",
        headline: `Only the workflow owner can browse ${provider} ${resource}.`,
        detail:
          input.serverMessage ??
          `This step runs on the workflow owner's ${provider} connection. Ask them to finish it, or enter the ID if you already have it.`,
        canRetry: false,
        canReconnect: false,
        canEnterManually: true,
      };

    case "empty":
      return {
        kind: "no-results",
        headline: `No ${resource} found in your ${provider} account.`,
        detail: `Create one in ${provider} and load again, or enter the ID if you already have it.`,
        canRetry: true,
        canReconnect: false,
        canEnterManually: true,
      };

    case "error":
      switch (input.code) {
        case "INTEGRATION_DISCONNECTED":
          return reconnect(
            "connection-missing",
            `${provider} isn't connected yet.`,
            `Connect ${provider}, then load your ${resource} again.`,
          );
        case "PROVIDER_REAUTH_REQUIRED":
          return reconnect(
            "reconnect-required",
            `Your ${provider} connection needs to be renewed.`,
            input.serverMessage ??
              `Reconnect ${provider} to load your ${resource} again.`,
          );
        case "OWNER_MUST_CONNECT":
          return reconnect(
            "connection-missing",
            `${provider} isn't connected yet.`,
            `This step runs on your ${provider} connection. Connect it, then load your ${resource} again.`,
          );
        case "NOT_WORKFLOW_OWNER":
          return {
            kind: "owner-managed",
            headline: `Only the workflow owner can browse ${provider} ${resource}.`,
            detail:
              input.serverMessage ??
              `This step runs on the workflow owner's ${provider} connection.`,
            canRetry: false,
            canReconnect: false,
            canEnterManually: true,
          };
        case "UNAUTHENTICATED":
          return {
            kind: "sign-in-required",
            headline: "Your session has expired.",
            detail: "Sign in again to load your options.",
            canRetry: false,
            canReconnect: false,
            canEnterManually: false,
          };
        case "MISSING_DEPENDENCY":
          return {
            kind: "parent-required",
            headline: input.missingDependency
              ? `Choose ${input.missingDependency} first.`
              : "Choose the earlier field first.",
            detail: `${provider} needs it before it can list your ${resource}.`,
            canRetry: false,
            canReconnect: false,
            canEnterManually: false,
          };
        case "SOURCE_NOT_FOUND":
          return {
            kind: "not-available",
            headline: `ChainReact can't browse ${provider} ${resource} for this step.`,
            detail: `Enter the ID from ${provider} to finish this field.`,
            canRetry: false,
            canReconnect: false,
            canEnterManually: true,
          };
        case "PROVIDER_ERROR":
          return {
            kind: "provider-unavailable",
            headline: `${provider} is temporarily unavailable.`,
            detail: `${cantLoad} Try again in a moment.`,
            canRetry: true,
            canReconnect: false,
            canEnterManually: true,
          };
        case "UNKNOWN":
          return {
            kind: "request-failed",
            headline: `We couldn't reach ChainReact to load your ${resource}.`,
            detail: "Check your connection, then try again.",
            canRetry: true,
            canReconnect: false,
            canEnterManually: true,
          };
        case "SERVER_ERROR":
        default:
          return {
            kind: "request-failed",
            headline: cantLoad,
            detail: "Something went wrong on our side. Try again.",
            canRetry: true,
            canReconnect: false,
            canEnterManually: true,
          };
      }

    default: {
      const _never: never = input.status;
      void _never;
      return {
        kind: "request-failed",
        headline: cantLoad,
        detail: "Try again.",
        canRetry: true,
        canReconnect: false,
        canEnterManually: true,
      };
    }
  }
}

/** Deep link to the account-scoped Apps page for one provider. Never an inline OAuth nav (that
 *  would leave the builder and drop the unsaved draft). */
export function reconnectHrefForProvider(provider: string | undefined): string {
  return provider && provider.length > 0
    ? `/apps?provider=${encodeURIComponent(provider)}`
    : "/apps";
}

/** Longest provider identifier we accept from manual entry. Well above every real provider id. */
export const MAX_MANUAL_OPTION_ID_LENGTH = 200;

export type ManualOptionIdValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/**
 * Validate a hand-typed provider identifier before it is committed to node config.
 *
 * This is the CLIENT guard only — the action/trigger's runtime `.strict()` Zod schema stays the
 * authoritative contract, and the resolver-backed fields this covers all commit a non-empty string
 * (`sanitizeSeedConfig` keeps `select-async` values as raw strings). What it must catch is the
 * failure mode the requirement calls out: a user typing the DISPLAY NAME they can see instead of
 * the id, which would silently save a value the provider will never match.
 */
export function validateManualOptionId(
  raw: string,
  options: { readonly fieldLabel?: string; readonly providerLabel?: string } = {},
): ManualOptionIdValidation {
  const label = options.fieldLabel?.trim() || "ID";
  const provider = options.providerLabel?.trim() || "the provider";
  const value = raw.trim();

  if (value.length === 0) {
    return { ok: false, message: `Enter the ${label} ID — it can't be blank.` };
  }
  if (value.length > MAX_MANUAL_OPTION_ID_LENGTH) {
    return {
      ok: false,
      message: `That's too long to be a ${label} ID. Paste just the identifier from ${provider}.`,
    };
  }
  if (value.includes("{{") || value.includes("}}")) {
    return {
      ok: false,
      message: `Enter a plain ID here. To use a value from an earlier step, open the step editor.`,
    };
  }
  if (/\s/.test(value)) {
    return {
      ok: false,
      message: `That looks like a name, not an ID — ${label} IDs don't contain spaces. Copy the ID from ${provider}.`,
    };
  }
  // Control characters / angle brackets are never part of a provider identifier and are the shape
  // of a pasted fragment of markup.
  // Written as a code-point scan rather than a regex: a control-character class trips
  // `no-control-regex`, and spelling the intent out is clearer than an inline disable.
  const hasControlOrMarkup = Array.from(value).some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f || ch === "<" || ch === ">";
  });
  if (hasControlOrMarkup) {
    return {
      ok: false,
      message: `That isn't a valid ${label} ID. Copy the ID from ${provider}.`,
    };
  }
  return { ok: true, value };
}
