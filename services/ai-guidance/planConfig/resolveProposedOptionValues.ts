/**
 * Async CANONICAL-RESOLVER pass for model-proposed dynamic option values (REACT-CONFIG-COVERAGE-1).
 *
 * When the user names a provider resource by LABEL ("post it to the general channel", "the Deals
 * board") the model can only echo the user's words — it cannot know the stored id. For every kept
 * config value that targets a field with an `optionsSource`, this pass:
 *
 *   1. loads the field's options through the SAME deterministic, account-scoped, credential-policy-
 *      governed resolver the builder UI uses (`resolveOptionsSourceForAI` — mirrors
 *      `/api/options/[source]`, never a model call),
 *   2. keeps a value that already matches a stored option VALUE (verified),
 *   3. maps a UNIQUE case-insensitive LABEL match onto its stored option value,
 *   4. otherwise DEFERS the field: the value is removed and the field is surfaced as a targeted
 *      user input — an ambiguous or unresolvable label never silently disappears and never ships
 *      as a guessed id.
 *
 * `dependsOn` parents are read from the SAME node's config; a cascade whose parent is missing or
 * itself unresolved defers rather than calling a resolver with partial deps. Resolver failures
 * (disconnected integration, provider error) defer — fail closed, never invent.
 *
 * Bounded: at most `MAX_RESOLVER_CALLS` resolver invocations per request (each may hit a provider
 * API). Server-only; the resolver implementation is injectable so tests mock the provider boundary.
 */

import { normalizeDependsOn, type FieldMeta } from "@/contracts/actionMeta";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import {
  resolveOptionsSourceForAI,
  type ResolveOptionsInput,
  type ResolveOptionsView,
} from "@/services/ai/tools/options";
import type { AiToolResult } from "@/services/ai/tools/types";

export type ResolveOptionsFn = (input: ResolveOptionsInput) => Promise<AiToolResult<ResolveOptionsView>>;

/** One config-bearing node to resolve (a plan step or a patch operation's target). */
export interface ResolveTarget {
  /** Caller-side handle (plan step ref / operation index) — echoed back untouched. */
  readonly ref: string;
  readonly kind: "trigger" | "action";
  /** `provider:type` capability key. */
  readonly capabilityKey: string;
  readonly config: Readonly<Record<string, unknown>>;
  /**
   * When present, ONLY these fields are candidates for resolution (the edit path passes the keys
   * the operation actually writes, while `config` may be merged with the node's existing values so
   * `dependsOn` parents resolve). Absent → every dynamic field present in `config` is a candidate.
   */
  readonly onlyFields?: readonly string[];
}

export interface ResolvedTarget {
  readonly ref: string;
  /** The config with dynamic values verified/mapped; deferred fields removed. */
  readonly config: Record<string, unknown>;
  /** Fields whose supplied dynamic value could not be resolved — surface as targeted input. */
  readonly deferredFields: readonly string[];
}

export interface ResolveProposedOptionValuesInput {
  readonly userId: string;
  readonly workflowId?: string;
  readonly targets: readonly ResolveTarget[];
  /** Test seam — defaults to the real AI options tool. */
  readonly resolveImpl?: ResolveOptionsFn;
}

/** Hard cap on provider-backed resolver calls per request. */
export const MAX_RESOLVER_CALLS = 8;

function fieldsFor(target: ResolveTarget): readonly FieldMeta[] | null {
  const meta = target.kind === "trigger" ? getTriggerMeta(target.capabilityKey) : getActionMeta(target.capabilityKey);
  return meta?.fields ?? null;
}

function isVariableString(v: unknown): boolean {
  return typeof v === "string" && v.includes("{{");
}

/** Match one candidate against resolver items: stored VALUE first, then unique label. */
function matchOption(items: ResolveOptionsView["items"], candidate: string): string | null {
  if (items.some((i) => i.value === candidate)) return candidate;
  const lowered = candidate.trim().toLowerCase();
  const matches = items.filter(
    (i) => i.label.trim().toLowerCase() === lowered || i.value.toLowerCase() === lowered,
  );
  return matches.length === 1 ? matches[0]!.value : null;
}

/**
 * Verify / label-map every dynamic (optionsSource) config value across the given targets. Returns
 * each target's updated config + the fields deferred to targeted user input. Never throws.
 */
export async function resolveProposedOptionValues(
  input: ResolveProposedOptionValuesInput,
): Promise<readonly ResolvedTarget[]> {
  const resolve = input.resolveImpl ?? resolveOptionsSourceForAI;
  let callsLeft = MAX_RESOLVER_CALLS;

  const out: ResolvedTarget[] = [];
  for (const target of input.targets) {
    const fields = fieldsFor(target);
    const config: Record<string, unknown> = { ...target.config };
    const deferredFields: string[] = [];
    if (!fields) {
      out.push({ ref: target.ref, config, deferredFields });
      continue;
    }
    const byName = new Map(fields.map((f) => [f.name, f]));

    const onlyFields = target.onlyFields ? new Set(target.onlyFields) : null;
    for (const field of fields) {
      if (!field.optionsSource) continue;
      if (onlyFields && !onlyFields.has(field.name)) continue;
      const raw = config[field.name];
      if (raw === undefined || isVariableString(raw)) continue;

      const candidates: string[] | null = Array.isArray(raw)
        ? raw.every((v) => typeof v === "string")
          ? (raw as string[])
          : null
        : typeof raw === "string"
          ? [raw]
          : null;
      if (candidates === null || candidates.length === 0) {
        delete config[field.name];
        deferredFields.push(field.name);
        continue;
      }
      // Variable-bearing items pass through untouched (runtime-resolved).
      if (candidates.some((c) => c.includes("{{"))) continue;

      // Cascading resolver: every declared parent must have a concrete string value in THIS config.
      const depNames = normalizeDependsOn(field.dependsOn);
      const deps: Record<string, string> = {};
      let depsOk = true;
      for (const dep of depNames) {
        const depValue = config[dep];
        const declaredParent = byName.get(dep);
        // A parent that is itself dynamic and unverified is still a usable dep VALUE only if it
        // survived its own resolution earlier in this loop (fields iterate in declaration order,
        // parents before children per the meta contract).
        if (typeof depValue === "string" && depValue.trim() !== "" && !depValue.includes("{{") && declaredParent) {
          deps[dep] = depValue;
        } else {
          depsOk = false;
        }
      }
      if (!depsOk) {
        delete config[field.name];
        deferredFields.push(field.name);
        continue;
      }

      if (callsLeft <= 0) {
        delete config[field.name];
        deferredFields.push(field.name);
        continue;
      }
      callsLeft -= 1;

      let view: ResolveOptionsView | null = null;
      try {
        const result = await resolve({
          source: field.optionsSource,
          userId: input.userId,
          ...(Object.keys(deps).length > 0 ? { deps } : {}),
          ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        });
        view = result.ok ? result.data : null;
      } catch {
        view = null;
      }

      if (!view) {
        delete config[field.name];
        deferredFields.push(field.name);
        continue;
      }

      let items = view.items;
      // Large truncated lists: retry ONCE with the first candidate as the search query.
      const firstUnmatched = candidates.find((c) => matchOption(items, c) === null);
      if (firstUnmatched !== undefined && view.hasMore && callsLeft > 0) {
        callsLeft -= 1;
        try {
          const searched = await resolve({
            source: field.optionsSource,
            userId: input.userId,
            q: firstUnmatched,
            ...(Object.keys(deps).length > 0 ? { deps } : {}),
            ...(input.workflowId ? { workflowId: input.workflowId } : {}),
          });
          if (searched.ok) items = [...items, ...searched.data.items];
        } catch {
          // keep the first page only
        }
      }

      const mapped = candidates.map((c) => matchOption(items, c));
      if (mapped.every((m): m is string => m !== null)) {
        config[field.name] = Array.isArray(raw) ? mapped : mapped[0]!;
      } else {
        delete config[field.name];
        deferredFields.push(field.name);
      }
    }

    out.push({ ref: target.ref, config, deferredFields });
  }
  return out;
}
