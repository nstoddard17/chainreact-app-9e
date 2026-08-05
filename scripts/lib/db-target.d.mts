/**
 * Type declarations for scripts/lib/db-target.mjs (see env-target.d.mts for
 * rationale). Keep in sync with the .mjs implementation.
 */
export declare const KNOWN_FOREIGN_REFS: Record<string, string>;

export declare function parseRefFromPgUrl(url: string | undefined): string | null;
export declare function parseRefFromSupabaseUrl(url: string | undefined): string | null;

export declare function validateMigrationTarget(env: Record<string, string | undefined>): {
  ok: boolean;
  expectedRef: string | null;
  targetRef: string | null;
  reason: string;
};

export declare function loadEnvFile(
  readFileSync: (path: string, encoding: string) => string,
  path: string,
): Record<string, string>;
