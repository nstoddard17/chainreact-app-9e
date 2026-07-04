/**
 * Certification seed — shared record builder.
 *
 * Split from the monolithic certificationSeed.ts. Pure + dependency-free
 * (type-only import; no runtime cycle with certification.ts).
 */
import type { CertificationRecord, CertificationStatus } from "../certification";

/** Compact builder for a batch of records that share status/note/date. */
export function records(
  status: CertificationStatus,
  note: string,
  date: string,
  keys: readonly (readonly [string, string])[],
): CertificationRecord[] {
  return keys.map(([provider, action]) => ({ provider, action, status, date, note }));
}
