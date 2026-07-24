import { z } from "zod";

/**
 * 5.TRUCK-BRIDGE-1 CS-1 — account-owned resource-link contracts.
 *
 * A resource link is an explicit, human-confirmed correspondence between the
 * SAME physical asset in two provider systems (first use case: a Motive vehicle
 * and its Fleetio counterpart). Backing table: `public.account_resource_links`
 * (migration 20260729000000).
 *
 * Scope discipline — this module carries ONLY what the repository and its tests
 * need. It is deliberately NOT the home for action schemas, matching/suggestion
 * result shapes, or UI contracts; those arrive with CS-2/CS-3/CS-4 in their own
 * modules.
 *
 * Provider-neutral in SHAPE, narrow in PRACTICE: the enums below accept exactly
 * what v1 supports (`vehicle`, `motive` → `fleetio`). Widening is an additive
 * edit here plus a forward-only CHECK migration — not a redesign. Nothing in
 * this file builds generic runtime provider behavior.
 *
 * The DTO is a SAFE projection. It carries provider resource ids, non-secret
 * display snapshots, and provenance user ids — never tokens, credentials,
 * integration row ids, provider payloads, or vehicle metadata beyond the two
 * labels.
 */

// ── Enumerations (mirror the migration's CHECK constraints exactly) ──────────

/** Asset kinds a link may describe. v1: vehicles only. */
export const RESOURCE_LINK_KINDS = ["vehicle"] as const;
export type ResourceLinkKind = (typeof RESOURCE_LINK_KINDS)[number];

/**
 * How a link came to exist. AUDIT/UX ONLY — never consulted at runtime.
 * `manual` is a hand-paired link; each `suggested_*` records which evidence
 * tier the user was shown before confirming (plan §4.5). Every row is
 * user-confirmed regardless of basis — a suggestion is never auto-applied.
 */
export const RESOURCE_LINK_MATCH_BASES = [
  "manual",
  "suggested_vin",
  "suggested_plate",
  "suggested_number",
  "suggested_name",
] as const;
export type ResourceLinkMatchBasis = (typeof RESOURCE_LINK_MATCH_BASES)[number];

export const ResourceLinkKindSchema = z.enum(RESOURCE_LINK_KINDS);
export const ResourceLinkMatchBasisSchema = z.enum(RESOURCE_LINK_MATCH_BASES);

/**
 * A provider id (`motive`, `fleetio`). Bounded to match the migration's
 * `length(...) <= 64` CHECK so an over-long value fails at the contract
 * boundary with a readable error instead of as a Postgres constraint violation.
 */
export const ResourceLinkProviderSchema = z
  .string()
  .trim()
  .min(1, "A provider id is required.")
  .max(64);

/**
 * An opaque provider-issued resource id. Never parsed, never normalized beyond
 * trimming, never interpolated into SQL — it reaches Postgres only as a bound
 * parameter through the Supabase client.
 */
export const ResourceLinkExternalIdSchema = z
  .string()
  .trim()
  .min(1, "A provider resource id is required.")
  .max(256);

/** Non-secret display snapshot ("Unit 104"). Optional; goes stale by design. */
export const ResourceLinkLabelSchema = z.string().trim().max(256);

// ── DTO ─────────────────────────────────────────────────────────────────────

/**
 * The repository's row projection — the ONLY shape a resource link leaves the
 * repository in. Raw Supabase rows never escape.
 *
 * `createdByUserId` / `confirmedByUserId` are PROVENANCE ONLY (they answer "who
 * set this up?" for the audit requirement). They MUST NEVER be used to decide
 * access: any member of the owning account may read, create, confirm, and
 * archive that account's links. Authorization is `accountId` + membership.
 */
export interface ResourceLinkDTO {
  readonly id: string;
  readonly accountId: string;
  readonly resourceKind: ResourceLinkKind;

  readonly sourceProvider: string;
  readonly sourceExternalId: string;
  readonly targetProvider: string;
  readonly targetExternalId: string;

  /** Last-seen display name, not truth. May be stale or absent. */
  readonly sourceLabel: string | null;
  readonly targetLabel: string | null;

  readonly matchBasis: ResourceLinkMatchBasis;

  /** Provenance only — never authorization. Null once the user is deleted. */
  readonly createdByUserId: string | null;
  readonly confirmedByUserId: string | null;
  readonly confirmedAt: string;

  /** Non-null once archived; archived links are excluded from active lookup. */
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ── Write input ─────────────────────────────────────────────────────────────

/**
 * Input for creating a CONFIRMED link. `.strict()` — an unknown key is a caller
 * bug, and silently accepting one is how a column that shouldn't exist gets
 * written. There is no "create an unconfirmed link" path: every row in this
 * table is confirmed by definition.
 *
 * `accountId` is supplied by the SERVER (from `resolveActiveAccount` on an
 * interactive path, or from the workflow's account on the execution path) and
 * is never taken from client input.
 */
export const CreateConfirmedResourceLinkInputSchema = z
  .object({
    accountId: z.string().uuid("An owning account id is required."),
    resourceKind: ResourceLinkKindSchema,

    sourceProvider: ResourceLinkProviderSchema,
    sourceExternalId: ResourceLinkExternalIdSchema,
    targetProvider: ResourceLinkProviderSchema,
    targetExternalId: ResourceLinkExternalIdSchema,

    sourceLabel: ResourceLinkLabelSchema.nullish(),
    targetLabel: ResourceLinkLabelSchema.nullish(),

    matchBasis: ResourceLinkMatchBasisSchema,

    /** Provenance. Nullable so a system-created link is representable. */
    createdByUserId: z.string().uuid().nullish(),
    confirmedByUserId: z.string().uuid().nullish(),
    /** ISO-8601 instant. Required — see the migration's NOT NULL, no DEFAULT. */
    confirmedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  // Mirrors the migration's `account_resource_links_distinct_sides` CHECK, so a
  // meaningless self-link is rejected at the contract boundary with a readable
  // message rather than as a raw constraint violation.
  .refine(
    (v) =>
      v.sourceProvider !== v.targetProvider ||
      v.sourceExternalId !== v.targetExternalId,
    { message: "A link must join two different resources." },
  );

export type CreateConfirmedResourceLinkInput = z.infer<
  typeof CreateConfirmedResourceLinkInputSchema
>;
