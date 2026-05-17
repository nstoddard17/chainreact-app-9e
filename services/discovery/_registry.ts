import {
  ActionMetaSchema,
  type ActionMeta,
} from "@/contracts/actionMeta";
import {
  TriggerMetaSchema,
  type TriggerMeta,
} from "@/contracts/triggerMeta";

// Native action metadata (Slice 3.0 coverage scope).
import { httpRequestMeta } from "@/integrations/native/actions/httpRequest.meta";
import { formatTransformerMeta } from "@/integrations/native/actions/formatTransformer.meta";
import { delayMeta } from "@/integrations/native/actions/delay.meta";
import { ifThenConditionMeta } from "@/integrations/native/actions/ifThenCondition.meta";
import { routerMeta } from "@/integrations/native/actions/router.meta";

// Native trigger metadata.
import { manualTriggerMeta } from "@/integrations/native/triggers/manualTrigger.meta";
import { scheduledTriggerMeta } from "@/integrations/native/triggers/scheduledTrigger.meta";

/**
 * Hand-maintained discovery metadata registry.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.0:
 *   - Explicit imports surface in PRs. Adding metadata for a new action
 *     means adding the import + the export array entry below.
 *   - Every meta is parsed against its Zod contract at module load.
 *     Build fails on any malformed meta with a clear error.
 *   - Duplicate (provider, type) keys are rejected at module load.
 *   - The exported lookup maps are frozen — no runtime mutation.
 *
 * Why this is hand-maintained rather than generated:
 *   - Matches the existing pattern in `services/execution/handlers/_registry.ts`
 *     and `integrations/_registry.ts`. Reviewer scans the PR diff to see
 *     exactly which actions a slice covers; no implicit auto-discovery.
 *   - Decouples the builder discovery surface from handler-schema Zod
 *     internals. The contracts in `contracts/actionMeta.ts` and
 *     `contracts/triggerMeta.ts` express UI concerns that don't belong
 *     in runtime validation schemas (labels, descriptions, dependsOn,
 *     optionsSource, displayOrder, FileRef awareness).
 *
 * Coverage scope (this commit): native only. Subsequent commits expand
 * coverage one provider at a time, validated by a coverage structural
 * test that grows its expected-coverage set alongside the imports.
 */

const ALL_ACTION_META: ReadonlyArray<ActionMeta> = [
  httpRequestMeta,
  formatTransformerMeta,
  delayMeta,
  ifThenConditionMeta,
  routerMeta,
];

const ALL_TRIGGER_META: ReadonlyArray<TriggerMeta> = [
  manualTriggerMeta,
  scheduledTriggerMeta,
];

// Validate each meta against its contract at module load. parse() throws on
// any malformed meta; loading any importer of this module fails the build
// with the exact path / message from Zod.
for (const meta of ALL_ACTION_META) {
  ActionMetaSchema.parse(meta);
}
for (const meta of ALL_TRIGGER_META) {
  TriggerMetaSchema.parse(meta);
}

// Build keyed lookups, rejecting duplicates at module load.
const actionByKey: ReadonlyMap<string, ActionMeta> = (() => {
  const m = new Map<string, ActionMeta>();
  for (const meta of ALL_ACTION_META) {
    if (m.has(meta.key)) {
      throw new Error(
        `Duplicate action meta registered for key '${meta.key}'.`,
      );
    }
    m.set(meta.key, meta);
  }
  return m;
})();

const triggerByKey: ReadonlyMap<string, TriggerMeta> = (() => {
  const m = new Map<string, TriggerMeta>();
  for (const meta of ALL_TRIGGER_META) {
    if (m.has(meta.key)) {
      throw new Error(
        `Duplicate trigger meta registered for key '${meta.key}'.`,
      );
    }
    m.set(meta.key, meta);
  }
  return m;
})();

// ─── Public accessors ────────────────────────────────────────────────────────

/**
 * Stable ordering helper: (displayOrder asc, displayName asc). Used by
 * every listing accessor so route responses and lib/api consumers see
 * deterministic shapes — important for snapshot tests + AI agents that
 * reason about ordering.
 */
function compareMeta<T extends { displayName: string; displayOrder: number | null }>(
  a: T,
  b: T,
): number {
  const ao = a.displayOrder;
  const bo = b.displayOrder;
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  return a.displayName.localeCompare(b.displayName);
}

/**
 * All action metas across every provider, sorted by displayOrder then
 * displayName. Use when you need the full catalog (admin tools, AI
 * planner, structural tests). For per-provider listings prefer
 * `listActionMetasForProvider`.
 */
export function listAllActionMetas(): readonly ActionMeta[] {
  return [...ALL_ACTION_META].sort(compareMeta);
}

/**
 * All trigger metas across every provider, sorted by displayOrder then
 * displayName.
 */
export function listAllTriggerMetas(): readonly TriggerMeta[] {
  return [...ALL_TRIGGER_META].sort(compareMeta);
}

export function listActionMetasForProvider(
  provider: string,
): readonly ActionMeta[] {
  return ALL_ACTION_META
    .filter((m) => m.provider === provider)
    .sort(compareMeta);
}

export function listTriggerMetasForProvider(
  provider: string,
): readonly TriggerMeta[] {
  return ALL_TRIGGER_META
    .filter((m) => m.provider === provider)
    .sort(compareMeta);
}

export function getActionMeta(key: string): ActionMeta | undefined {
  return actionByKey.get(key);
}

export function getTriggerMeta(key: string): TriggerMeta | undefined {
  return triggerByKey.get(key);
}

/**
 * Returns the set of provider ids that have at least one action OR
 * trigger meta registered. Used by the providers index route to filter
 * the provider-manifest list to "providers the builder can fully
 * surface today."
 */
export function listProvidersWithMetadata(): readonly string[] {
  const set = new Set<string>();
  for (const m of ALL_ACTION_META) set.add(m.provider);
  for (const m of ALL_TRIGGER_META) set.add(m.provider);
  return [...set].sort();
}
