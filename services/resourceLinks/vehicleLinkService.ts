import {
  listLinks,
  createConfirmedLink,
  archiveLink,
} from "@/repositories/resourceLinks/accountResourceLinks";
import { listMemberIdentities } from "@/repositories/accountMemberships";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";
import {
  CreateVehicleLinkBodySchema,
  VEHICLE_LINK_SOURCE_PROVIDER,
  VEHICLE_LINK_TARGET_PROVIDER,
  type CreateVehicleLinkBody,
  type UnlinkedVehicleView,
  type VehicleLinkView,
} from "@/contracts/vehicleLinks";
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";
import type { VehicleOptionView } from "@/contracts/vehicleLinks";

/**
 * Vehicle-link management service (5.TRUCK-BRIDGE-1 CS-4).
 *
 * The brain between thin routes and the DATABASE-ONLY CS-1 repository:
 * authorization, conflict detection, label snapshots, and the row→view
 * projection all live here. Routes own HTTP; the repository owns SQL; neither
 * owns a policy decision.
 *
 * ── Authorization (v1 decision) ────────────────────────────────────────────
 * Mutations (create / replace / archive) are OWNER + ADMIN. Reads are any
 * member. A vehicle mapping is fleet configuration that changes where a meter
 * reading LANDS, so it sits with the administrative acts (API keys, connect /
 * disconnect) rather than with day-to-day workflow editing. Plan Q6 asked
 * whether members should be able to confirm; CS-4 answers "no, for now" — a
 * narrower gate can be widened later without breaking anyone, the reverse
 * cannot.
 *
 * Authorization is `accountId` + membership role. It NEVER consults
 * `created_by_user_id`, `confirmed_by_user_id`, or who connected the Motive /
 * Fleetio integration — those are provenance, and provenance is not authority
 * (docs/rules/account-ownership-model.md).
 *
 * Every function takes `accountId` as a SERVER-DERIVED value. Nothing here
 * accepts an account id from a request body, and the repository's mandatory
 * `account_id` predicate means a link id belonging to another account resolves
 * to "not found" rather than to that row.
 *
 * ── Conflict posture ───────────────────────────────────────────────────────
 * Two distinct conflicts, deliberately handled differently:
 *
 *   - SOURCE conflict (this Motive vehicle is already linked): recoverable and
 *     common — the user is re-pointing a truck. Refused with the current target
 *     named, and only proceeds when the caller passes `replaceExisting: true`.
 *     Nothing is ever silently overwritten.
 *   - TARGET conflict (this Fleetio vehicle is already claimed by a DIFFERENT
 *     Motive vehicle): refused outright with the other side named. Auto-
 *     archiving someone else's mapping to satisfy this one would move a second
 *     truck's readings without the user asking — so the fix has to be explicit
 *     removal of that link first.
 *
 * Both names in those messages belong to the SAME account, so neither can leak
 * across a tenant boundary.
 */

// ── Result types ────────────────────────────────────────────────────────────

export type VehicleLinkAuthzReason = "not_member" | "forbidden";

export type CreateVehicleLinkReason =
  | VehicleLinkAuthzReason
  | "account_frozen"
  | "invalid_input"
  | "source_already_linked"
  | "target_already_linked"
  | "conflict";

export type CreateVehicleLinkResult =
  | { ok: true; link: VehicleLinkView }
  | {
      ok: false;
      reason: CreateVehicleLinkReason;
      /** The already-linked counterpart, when one explains the refusal. */
      conflict?: { sourceLabel: string | null; targetLabel: string | null };
    };

export type ArchiveVehicleLinkReason =
  | VehicleLinkAuthzReason
  | "account_frozen"
  | "not_found";

export type ArchiveVehicleLinkResult =
  | { ok: true }
  | { ok: false; reason: ArchiveVehicleLinkReason };

export type ListVehicleLinksResult =
  | { ok: true; links: readonly VehicleLinkView[] }
  | { ok: false; reason: "not_member" };

// ── Projection ──────────────────────────────────────────────────────────────

/**
 * Explicit row→view projection. The DTO is never spread: `accountId`,
 * `createdByUserId`, `confirmedByUserId`, `resourceKind`, both provider ids and
 * the row timestamps stay server-side. `confirmedByUserId` is replaced by an
 * already-resolved display label so no raw user id crosses to the browser.
 */
function toView(
  link: ResourceLinkDTO,
  labelByUserId: ReadonlyMap<string, string>,
): VehicleLinkView {
  return {
    id: link.id,
    sourceVehicleId: link.sourceExternalId,
    sourceLabel: link.sourceLabel,
    targetVehicleId: link.targetExternalId,
    targetLabel: link.targetLabel,
    matchBasis: link.matchBasis,
    confirmedByLabel:
      link.confirmedByUserId !== null
        ? (labelByUserId.get(link.confirmedByUserId) ?? null)
        : null,
    confirmedAt: link.confirmedAt,
  };
}

/**
 * Co-member display labels for the audit column. Read through the SECURITY
 * DEFINER membership RPC, which gates on `auth.uid()` — so it can only ever
 * return identities from an account the CALLER belongs to. Degrades to an empty
 * map on failure: an unnamed confirmer is a cosmetic gap, not a reason to fail
 * the whole screen.
 */
async function memberLabels(accountId: string): Promise<ReadonlyMap<string, string>> {
  try {
    const identities = await listMemberIdentities(accountId);
    const out = new Map<string, string>();
    for (const identity of identities) {
      const label = identity.displayName?.trim() || identity.email?.trim();
      if (label) out.set(identity.userId, label);
    }
    return out;
  } catch {
    return new Map();
  }
}

/** Active vehicle links only — archived rows are history, not mappings. */
async function activeVehicleLinks(accountId: string): Promise<readonly ResourceLinkDTO[]> {
  const all = await listLinks(accountId, "vehicle");
  return all.filter(
    (l) =>
      l.archivedAt === null &&
      l.sourceProvider === VEHICLE_LINK_SOURCE_PROVIDER &&
      l.targetProvider === VEHICLE_LINK_TARGET_PROVIDER,
  );
}

// ── Read ────────────────────────────────────────────────────────────────────

/**
 * Every ACTIVE Motive→Fleetio vehicle link for the account. Any member may
 * read: a member can already use these links in a workflow (CS-3), so hiding
 * them would only make failures harder to understand.
 */
export async function listVehicleLinks(input: {
  accountId: string;
  actingUserId: string;
}): Promise<ListVehicleLinksResult> {
  const role = await requireAccountRole(input.actingUserId, input.accountId, [
    "owner",
    "admin",
    "member",
  ]);
  if (!role.ok) return { ok: false, reason: "not_member" };

  const [links, labels] = await Promise.all([
    activeVehicleLinks(input.accountId),
    memberLabels(input.accountId),
  ]);
  return { ok: true, links: links.map((l) => toView(l, labels)) };
}

/**
 * Motive vehicles with no ACTIVE link — the Unlinked list. Pure set difference
 * against the account's own links; no provider call happens here (the caller
 * supplies the already-loaded vehicle page).
 */
export function unlinkedVehicles(
  vehicles: readonly VehicleOptionView[],
  links: readonly VehicleLinkView[],
): readonly UnlinkedVehicleView[] {
  const linked = new Set(links.map((l) => l.sourceVehicleId));
  return vehicles
    .filter((v) => !linked.has(v.value))
    .map((v) => ({ sourceVehicleId: v.value, label: v.label }));
}

// ── Write ───────────────────────────────────────────────────────────────────

/**
 * Confirm a manual Motive→Fleetio pairing.
 *
 * `matchBasis` is always `"manual"` in CS-4 — the only way a link can exist
 * today is a human picking both sides. The `suggested_*` bases stay unused
 * until CS-5 ships suggestions, and the caller cannot supply one (the body
 * schema has no `matchBasis` field).
 */
export async function createVehicleLink(input: {
  accountId: string;
  actingUserId: string;
  body: unknown;
  /** Injected so the confirmation instant is deterministic in tests. */
  now?: string;
}): Promise<CreateVehicleLinkResult> {
  const gate = await requireMutationRole(input.accountId, input.actingUserId);
  if (!gate.ok) return gate;

  const parsed = CreateVehicleLinkBodySchema.safeParse(input.body);
  if (!parsed.success) return { ok: false, reason: "invalid_input" };
  const body: CreateVehicleLinkBody = parsed.data;

  // A link must join two different resources (mirrors the DB's distinct_sides
  // CHECK). Two different providers, so this can only trip on identical ids.
  const links = await activeVehicleLinks(input.accountId);

  const targetConflict = links.find(
    (l) =>
      l.targetExternalId === body.targetVehicleId &&
      l.sourceExternalId !== body.sourceVehicleId,
  );
  if (targetConflict) {
    return {
      ok: false,
      reason: "target_already_linked",
      conflict: {
        sourceLabel: targetConflict.sourceLabel,
        targetLabel: targetConflict.targetLabel,
      },
    };
  }

  const sourceConflict = links.find((l) => l.sourceExternalId === body.sourceVehicleId);
  if (sourceConflict) {
    // Already pointing at exactly this Fleetio vehicle — nothing to do, and
    // re-creating would trip the unique index. Idempotent success.
    if (sourceConflict.targetExternalId === body.targetVehicleId) {
      const labels = await memberLabels(input.accountId);
      return { ok: true, link: toView(sourceConflict, labels) };
    }
    if (body.replaceExisting !== true) {
      return {
        ok: false,
        reason: "source_already_linked",
        conflict: {
          sourceLabel: sourceConflict.sourceLabel,
          targetLabel: sourceConflict.targetLabel,
        },
      };
    }
    // Explicitly confirmed replacement: archive first so the partial unique
    // index frees the pair, then insert. Archival (not deletion) keeps a past
    // run explainable.
    await archiveLink(input.accountId, sourceConflict.id, input.now ?? new Date().toISOString());
  }

  const confirmedAt = input.now ?? new Date().toISOString();
  let created: ResourceLinkDTO;
  try {
    created = await createConfirmedLink({
      accountId: input.accountId,
      resourceKind: "vehicle",
      sourceProvider: VEHICLE_LINK_SOURCE_PROVIDER,
      sourceExternalId: body.sourceVehicleId,
      targetProvider: VEHICLE_LINK_TARGET_PROVIDER,
      targetExternalId: body.targetVehicleId,
      sourceLabel: body.sourceLabel ?? null,
      targetLabel: body.targetLabel ?? null,
      matchBasis: "manual",
      createdByUserId: input.actingUserId,
      confirmedByUserId: input.actingUserId,
      confirmedAt,
    });
  } catch (err) {
    // The in-memory pre-checks above cover the ordinary cases; this catches the
    // RACE (two admins confirming at once) that only the partial unique indexes
    // can settle. The repository surfaces Postgres' message, so the duplicate is
    // recognized by its text — deliberately a BEST-EFFORT refinement: anything
    // unrecognized still becomes a safe `conflict`, never a leaked DB error.
    const message = err instanceof Error ? err.message : "";
    if (/duplicate key|unique constraint/i.test(message)) {
      return { ok: false, reason: "conflict" };
    }
    return { ok: false, reason: "conflict" };
  }

  const labels = await memberLabels(input.accountId);
  return { ok: true, link: toView(created, labels) };
}

/**
 * Archive (remove) one link. Soft by design — the row survives so a historical
 * run that used it stays explainable, and the partial unique indexes free the
 * pair so the vehicle can be re-linked immediately.
 *
 * A link id from another account returns `not_found`, identical to an id that
 * never existed and to an already-archived one. That collapse is deliberate:
 * the caller learns nothing about another account's data, not even whether the
 * id exists.
 */
export async function archiveVehicleLink(input: {
  accountId: string;
  actingUserId: string;
  linkId: string;
  now?: string;
}): Promise<ArchiveVehicleLinkResult> {
  const gate = await requireMutationRole(input.accountId, input.actingUserId);
  if (!gate.ok) return gate;

  const archived = await archiveLink(
    input.accountId,
    input.linkId,
    input.now ?? new Date().toISOString(),
  );
  if (!archived) return { ok: false, reason: "not_found" };
  return { ok: true };
}

// ── Shared gate ─────────────────────────────────────────────────────────────

/**
 * Owner/admin + not-frozen. Re-checked HERE even though every route also gates,
 * so the service is safe no matter which caller reaches it (a future internal
 * caller, a background job, a test). Defense in depth, not duplication of
 * responsibility: the route maps the failure to HTTP, the service decides it.
 */
async function requireMutationRole(
  accountId: string,
  actingUserId: string,
): Promise<
  { ok: true } | { ok: false; reason: VehicleLinkAuthzReason | "account_frozen" }
> {
  const role = await requireAccountRole(actingUserId, accountId, ["owner", "admin"]);
  if (!role.ok) return { ok: false, reason: role.reason };
  if (await isAccountFrozen(accountId)) return { ok: false, reason: "account_frozen" };
  return { ok: true };
}
