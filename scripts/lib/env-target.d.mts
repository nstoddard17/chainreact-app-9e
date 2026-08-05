/**
 * Type declarations for scripts/lib/env-target.mjs so TypeScript owner
 * scripts (scripts/integrations-transplant/) can reuse the CANONICAL
 * environment-target guard instead of reimplementing production detection.
 * Keep in sync with the .mjs implementation.
 */
export declare const PRODUCTION_PROJECT_REF: string;
export declare const PROTECTED_REFS: Record<string, string>;
export declare const VALID_TARGETS: readonly string[];

export declare function isLoopbackUrl(url: string | undefined): boolean;

export declare function resolveDbTarget(
  env: Record<string, string | undefined>,
  opts: { expectedTarget: string; requireConfirm?: boolean },
): { ok: boolean; target: string | null; ref: string | null; reason: string };

export declare function validateLinkedRef(
  linkedRef: string | null | undefined,
  devRef: string,
): { ok: boolean; reason: string };
