/**
 * API-key scope model (Slice 4.API-KEYS-FOUNDATION-2 / FK-1).
 *
 * Two axes (per the foundation plan §3/§12):
 *   - KNOWN scopes — every value the system recognizes. The DB CHECK constrains
 *     `account_api_keys.scopes` to this exact set, so the column stays valid as
 *     more scopes are enabled WITHOUT a migration.
 *   - LAUNCH-ENABLED scopes — the subset a key may actually be CREATED with today.
 *     Launch ships `workflows:trigger` ONLY; the rest are reserved/disabled.
 *
 * Role gates *who manages keys* (owner/admin, FK-2); scopes gate *what a key can
 * do*. This module is pure data + validators — no DB, no I/O.
 */

export const API_KEY_SCOPE_TRIGGER = "workflows:trigger" as const;

/** Every recognized scope value. Mirrors the DB CHECK set exactly. */
export const KNOWN_API_KEY_SCOPES = [
  "workflows:trigger",
  "workflows:read",
  "workflows:manage",
  "account:read",
] as const;

export type ApiKeyScope = (typeof KNOWN_API_KEY_SCOPES)[number];

/** Scopes a key may be created with at launch. Trigger-only (smallest blast radius). */
export const LAUNCH_ENABLED_API_KEY_SCOPES: readonly ApiKeyScope[] = [
  API_KEY_SCOPE_TRIGGER,
];

export function isKnownApiKeyScope(scope: string): scope is ApiKeyScope {
  return (KNOWN_API_KEY_SCOPES as readonly string[]).includes(scope);
}

export function isLaunchEnabledApiKeyScope(scope: string): boolean {
  return (LAUNCH_ENABLED_API_KEY_SCOPES as readonly string[]).includes(scope);
}

export type ValidateScopesResult =
  | { ok: true; scopes: ApiKeyScope[] }
  | { ok: false; reason: "empty" | "unknown_scope" | "scope_not_enabled" };

/**
 * Validate a create-time scope list: non-empty, every value KNOWN and currently
 * LAUNCH-ENABLED. The repo/route (FK-2) calls this before insert so a caller can
 * never mint a key with a reserved/disabled scope.
 */
export function validateApiKeyScopes(scopes: readonly string[]): ValidateScopesResult {
  if (!scopes || scopes.length === 0) return { ok: false, reason: "empty" };
  for (const scope of scopes) {
    if (!isKnownApiKeyScope(scope)) return { ok: false, reason: "unknown_scope" };
    if (!isLaunchEnabledApiKeyScope(scope)) return { ok: false, reason: "scope_not_enabled" };
  }
  return { ok: true, scopes: [...scopes] as ApiKeyScope[] };
}

/** Does a key's granted scope list include the required scope? (FK-4 verify path.) */
export function hasApiKeyScope(scopes: readonly string[], required: ApiKeyScope): boolean {
  return scopes.includes(required);
}
