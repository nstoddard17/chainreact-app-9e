import { z } from "zod";
import {
  ResourceLinkExternalIdSchema,
  ResourceLinkKindSchema,
  ResourceLinkProviderSchema,
} from "./resourceLinks";

/**
 * 5.TRUCK-BRIDGE-1 CS-5 — dismissed vehicle-match suggestion contracts.
 *
 * Backing table: `public.account_resource_link_dismissals` (migration
 * 20260731000000). A dismissal is the OPPOSITE of a resource link — it records a
 * pairing a human REJECTED — so it lives in its own module and its own table,
 * and it is deliberately not representable as a link (per the CS-5 brief:
 * "do not store a dismissal as a confirmed link").
 *
 * Nothing on the execution path reads dismissals. Their entire blast radius is
 * which rows the Suggested tab shows.
 */

/** Match tiers a suggestion can carry. Mirrors `core/resourceLinks/matchSignals`. */
export const RESOURCE_LINK_MATCH_TIERS = ["vin", "plate", "number", "name"] as const;
export type ResourceLinkMatchTier = (typeof RESOURCE_LINK_MATCH_TIERS)[number];
export const ResourceLinkMatchTierSchema = z.enum(RESOURCE_LINK_MATCH_TIERS);

/**
 * `<tier>|<evidence>` exactly as the user saw it when they dismissed.
 *
 * Compared for EQUALITY only — never parsed, never interpolated into SQL. It is
 * what makes a dismissal *specific*: the pair stays suppressed only while the
 * claim being made about it is unchanged. Bounded to match the migration's
 * `length(...) <= 512` CHECK so an over-long value fails at the contract
 * boundary with a readable error instead of as a constraint violation.
 */
export const EvidenceFingerprintSchema = z
  .string()
  .trim()
  .min(1, "Evidence is required to dismiss a suggestion.")
  .max(512);

/**
 * Repository projection. Carries no `accountId` consumer decision and no raw
 * user id beyond the provenance column the audit requirement needs.
 */
export interface ResourceLinkDismissalDTO {
  readonly id: string;
  readonly accountId: string;
  readonly resourceKind: "vehicle";
  readonly sourceProvider: string;
  readonly sourceExternalId: string;
  readonly targetProvider: string;
  readonly targetExternalId: string;
  readonly matchTier: ResourceLinkMatchTier;
  readonly evidenceFingerprint: string;
  /** Provenance only — never authorization. Null once the user is deleted. */
  readonly dismissedByUserId: string | null;
  readonly dismissedAt: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Input for recording a dismissal. `.strict()` — an unknown key is a caller bug.
 * `accountId` is supplied by the SERVER and is never taken from client input.
 */
export const CreateResourceLinkDismissalInputSchema = z
  .object({
    accountId: z.string().uuid("An owning account id is required."),
    resourceKind: ResourceLinkKindSchema,
    sourceProvider: ResourceLinkProviderSchema,
    sourceExternalId: ResourceLinkExternalIdSchema,
    targetProvider: ResourceLinkProviderSchema,
    targetExternalId: ResourceLinkExternalIdSchema,
    matchTier: ResourceLinkMatchTierSchema,
    evidenceFingerprint: EvidenceFingerprintSchema,
    dismissedByUserId: z.string().uuid().nullish(),
    dismissedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  // Mirrors the migration's `arld_distinct_sides` CHECK.
  .refine(
    (v) =>
      v.sourceProvider !== v.targetProvider ||
      v.sourceExternalId !== v.targetExternalId,
    { message: "A dismissal must describe two different resources." },
  );

export type CreateResourceLinkDismissalInput = z.infer<
  typeof CreateResourceLinkDismissalInputSchema
>;
