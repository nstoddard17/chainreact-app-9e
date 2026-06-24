/**
 * Write smoke harness deps — shared smoke-reader contract.
 *
 * The provider read-back seams (Airtable / Trello / file-providers / calendars)
 * each export a `SmokeReader`: a bounded, sanitized, READ-ONLY provider call used to
 * verify a marker / prove deletion where no user-facing read action fits. A reader
 * returns:
 *   - a `StepRunOutcome` when it OWNS the (provider, action) pair (even an error /
 *     not-connected outcome — it must NOT fall through once matched), or
 *   - `null` when the (provider, action) is not its responsibility (so the composer
 *     tries the next reader).
 *
 * SAFETY invariants every reader keeps (see seam-refresh-guard.test.ts):
 *   - every provider HTTP wrapper call runs inside a `refreshAndRetry` apiCall lambda
 *     (NEVER a raw `decryptToken(...)` + direct wrapper call);
 *   - output is bounded + sanitized (only the fields a verify reads — never raw
 *     provider payloads / tokens / PII);
 *   - typed not-found deletion checks map ONLY the typed NotFoundError to
 *     `exists:false` and RE-THROW any other error (so a permission/API failure can
 *     never read as "deleted" — the composer's outer catch sanitizes it).
 */
import type { StepRunOutcome } from "../writeHarness";

export interface SmokeReaderContext {
  /** Account that owns the smoke workflows + provider creds. */
  readonly accountId: string;
  /** Provenance user (the connector for personal-credential providers). */
  readonly userId: string;
}

export interface SmokeReaderInput {
  readonly provider: string;
  readonly action: string;
  readonly config: Readonly<Record<string, unknown>>;
}

/**
 * A smoke read-back seam for one provider cluster. Returns a `StepRunOutcome` when it
 * handles the (provider, action), else `null` to defer to the next reader.
 */
export type SmokeReader = (
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
) => Promise<StepRunOutcome | null>;
