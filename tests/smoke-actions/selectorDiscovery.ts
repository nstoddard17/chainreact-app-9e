/**
 * Action smoke harness — Tier-1 selector AUTO-DISCOVERY (pure engine).
 *
 * Read-only smoke fixtures that target a single resource (a board, a customer, a
 * campaign, …) declare that resource as a config selector via `configFromEnv`
 * (field → `SMOKE_<PROVIDER>_*` env). Manually pinning every id by hand is the
 * friction this module removes: in LIVE mode, when a selector env is unset but
 * the provider is connected on the smoke account, the harness discovers a usable
 * value from the provider's OWN safe list/search APIs — the exact same option
 * resolvers the builder's dropdowns use.
 *
 * This file is the PURE engine. It knows the algorithm (walk the action's
 * metadata field graph, resolve each selector's `optionsSource` cascade, take the
 * first item) but performs NO IO itself: the metadata lookup + the actual
 * resolver dispatch are injected (`SelectorDiscoveryDeps`). The real, server-only
 * wiring (account-scoped `getActiveForExecution` + the options resolver registry)
 * lives in `workflowRunDeps.ts`; unit tests drive this with fakes.
 *
 * SAFETY: discovery only ever calls READ option resolvers (list/search). It never
 * mutates, sends, deletes, or creates. It runs only in live mode, only after the
 * liveSafe / write / destructive gates have already passed.
 */
import type { SmokeDiscoveryState } from "@/scripts/chainreact/smoke/core";

/** Minimal projection of an action's metadata field graph the engine needs. */
export interface DiscoveryMetaField {
  readonly name: string;
  /** Whether the builder/readiness check requires this field to be set. */
  readonly required?: boolean;
  /** `<provider>:<resource>` options source backing this field (if any). */
  readonly optionsSource?: string;
  /** Parent field(s) this field cascades from (single- or multi-parent hint). */
  readonly dependsOn?: string | readonly string[];
}
export interface DiscoveryMeta {
  readonly fields: readonly DiscoveryMetaField[];
}

/** Outcome of resolving ONE option source against the connected account. */
export type SourceResolveOutcome =
  | { readonly kind: "items"; readonly values: readonly string[] }
  | { readonly kind: "not-connected" }
  | { readonly kind: "empty" }
  | { readonly kind: "error"; readonly reason?: string };

export interface SelectorDiscoveryDeps {
  /** Action metadata by `<provider>:<action>` key (the field graph). */
  getMeta(actionKey: string): DiscoveryMeta | undefined;
  /**
   * The dep field NAMES an option source requires (from the resolver registry's
   * `requiredDeps`). Used to resolve multi-parent cascades; falls back to the
   * meta field's single `dependsOn` when this returns undefined.
   */
  requiredDepsForSource(source: string): readonly string[] | undefined;
  /** Run ONE option source against the connected account (real list/search read). */
  resolveSource(input: {
    readonly source: string;
    readonly deps: Readonly<Record<string, string>>;
  }): Promise<SourceResolveOutcome>;
}

export interface DiscoverSelectorsInput {
  readonly provider: string;
  readonly action: string;
  /**
   * Fields that ALREADY have a concrete value — fixture config literals plus any
   * manual `SMOKE_<PROVIDER>_*` env override. Discovery skips these (manual env
   * always wins) and reuses their string values as cascade dependency values so a
   * child selector can be discovered under an operator-pinned parent.
   */
  readonly presentFields: Readonly<Record<string, unknown>>;
}

export type DiscoverSelectorsResult =
  | {
      readonly ok: true;
      /** Discovered field → value overlay to merge onto the action config. */
      readonly overlay: Readonly<Record<string, string>>;
      /** Field NAMES that were auto-discovered (never values). */
      readonly discoveredFields: readonly string[];
    }
  | {
      readonly ok: false;
      /** A discovery-blocking state (never "discovered"/"connected"). */
      readonly state: Extract<SmokeDiscoveryState, "unavailable" | "empty" | "error" | "not-connected">;
      readonly blockedField: string;
      readonly reason?: string;
    };

/**
 * Discover values for every needed selector field of one action by walking its
 * metadata field graph and resolving each field's `optionsSource` cascade. Pure
 * over the injected deps; memoizes shared parents so a cascade root (e.g.
 * `boardId`) is resolved once even when several leaves depend on it.
 */
export async function discoverSelectors(
  input: DiscoverSelectorsInput,
  deps: SelectorDiscoveryDeps,
): Promise<DiscoverSelectorsResult> {
  const { provider, action, presentFields } = input;

  const meta = deps.getMeta(`${provider}:${action}`);
  if (!meta) {
    // No metadata → we cannot know which fields are required or which option
    // source backs them. Nothing safe to discover; rely on config/env.
    return { ok: true, overlay: {}, discoveredFields: [] };
  }
  const fieldByName = new Map(meta.fields.map((f) => [f.name, f]));

  // Drive discovery off the action's REQUIRED fields (the builder readiness check
  // requires every `required` field — including cascade parents like a OneNote
  // notebookId above the sectionId leaf — so all of them must end up on the
  // config, not just the author-declared leaf). A required field with no option
  // source is "unavailable" (must be pinned via env); a required sourced field is
  // auto-discovered. Optional sourced fields are intentionally left unset.
  const neededFields = meta.fields
    .filter((f) => f.required === true && !(f.name in presentFields))
    .map((f) => f.name);
  if (neededFields.length === 0) {
    return { ok: true, overlay: {}, discoveredFields: [] };
  }

  // Memo of resolved field values: seeded with already-present STRING values
  // (config literals + env pins) so a child can cascade off a pinned parent.
  const memo = new Map<string, string>();
  for (const [k, v] of Object.entries(presentFields)) {
    if (typeof v === "string" && v.length > 0) memo.set(k, v);
  }
  // Guard against a malformed cyclic dependsOn graph.
  const inProgress = new Set<string>();

  type FieldOutcome =
    | { readonly ok: true; readonly value: string }
    | {
        readonly ok: false;
        readonly state: Extract<SmokeDiscoveryState, "unavailable" | "empty" | "error" | "not-connected">;
        readonly blockedField: string;
        readonly reason?: string;
      };

  const resolveField = async (fieldName: string): Promise<FieldOutcome> => {
    const pinned = memo.get(fieldName);
    if (pinned !== undefined) return { ok: true, value: pinned };

    if (inProgress.has(fieldName)) {
      return { ok: false, state: "unavailable", blockedField: fieldName, reason: "cyclic dependsOn" };
    }
    const field = fieldByName.get(fieldName);
    if (!field || !field.optionsSource) {
      // No safe auto-discovery for this selector — operator must pin its env.
      return { ok: false, state: "unavailable", blockedField: fieldName, reason: "no option source" };
    }
    const source = field.optionsSource;

    inProgress.add(fieldName);
    try {
      // Resolve every dependency this source needs first (multi-parent aware).
      const metaDeps = field.dependsOn
        ? Array.isArray(field.dependsOn)
          ? field.dependsOn
          : [field.dependsOn]
        : [];
      const depNames = deps.requiredDepsForSource(source) ?? metaDeps;
      const resolvedDeps: Record<string, string> = {};
      for (const depName of depNames) {
        const dep = await resolveField(depName);
        if (!dep.ok) return dep; // propagate the blocking state (with the deepest blocked field)
        resolvedDeps[depName] = dep.value;
      }

      const outcome = await deps.resolveSource({ source, deps: resolvedDeps });
      switch (outcome.kind) {
        case "items": {
          const value = outcome.values[0];
          if (value === undefined || value === "") {
            return { ok: false, state: "empty", blockedField: fieldName };
          }
          memo.set(fieldName, value);
          return { ok: true, value };
        }
        case "not-connected":
          return { ok: false, state: "not-connected", blockedField: fieldName };
        case "empty":
          return { ok: false, state: "empty", blockedField: fieldName };
        case "error":
          return { ok: false, state: "error", blockedField: fieldName, reason: outcome.reason };
      }
    } finally {
      inProgress.delete(fieldName);
    }
  };

  const overlay: Record<string, string> = {};
  const discoveredFields: string[] = [];
  for (const fieldName of neededFields) {
    const r = await resolveField(fieldName);
    if (!r.ok) {
      return { ok: false, state: r.state, blockedField: r.blockedField, ...(r.reason ? { reason: r.reason } : {}) };
    }
    overlay[fieldName] = r.value;
    discoveredFields.push(fieldName);
  }
  return { ok: true, overlay, discoveredFields };
}
