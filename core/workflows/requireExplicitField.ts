/**
 * Q11 — Explicit-required-field check.
 *
 * High-risk action defaults (auto-notify, visibility/sharing, consent
 * settings, AI behavior, etc.) MUST be supplied explicitly by the workflow
 * author — handlers do not silently fill them in.
 *
 * `0`, `false`, and `""` are valid explicit choices and pass through; only
 * `undefined` and `null` are treated as missing.
 */

export type ConfigFailureCode =
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_FIELD_FORMAT";

export type ConfigFailure = {
  success: false;
  category: "config";
  error: { code: ConfigFailureCode; path: string };
  message: string;
};

export type RequireResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ConfigFailure };

export function requireExplicitField<T>(
  value: T | null | undefined,
  fieldPath: string,
  displayName?: string,
): RequireResult<NonNullable<T>> {
  if (value === undefined || value === null) {
    return {
      ok: false,
      failure: {
        success: false,
        category: "config",
        error: { code: "MISSING_REQUIRED_FIELD", path: fieldPath },
        message: `Required field '${displayName ?? fieldPath}' was not provided.`,
      },
    };
  }
  return { ok: true, value: value as NonNullable<T> };
}
