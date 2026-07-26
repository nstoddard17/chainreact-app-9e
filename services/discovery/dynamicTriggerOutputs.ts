/**
 * Server-side resolution of resolver-backed dynamic TRIGGER outputs
 * (TYPEFORM-DYNAMIC-OUTPUTS-CONSUMPTION-1).
 *
 * The I/O half of `TriggerMeta.dynamicOutputSource`. Given a trigger node's committed config, it
 * resolves the declared options source through the EXISTING resolver boundary and hands the result to
 * the pure merger in `core/`. The builder does the same thing from the client via `/api/options`; both
 * end at `mergeDynamicTriggerOutputs`, so there is one key generator and one merge rule.
 *
 * Boundaries this deliberately respects:
 *   - the static registry is never mutated and never performs I/O — this reads a declaration;
 *   - no provider-specific knowledge lives here. Typeform is simply the first meta that declares a
 *     source; a sheet-columns or CRM-properties trigger works with zero changes to this file;
 *   - resolver failures are NEVER thrown into the caller's path. Guidance and readiness must keep
 *     working when a provider is down — they just fall back to the static outputs and say so.
 */

import {
  mergeDynamicTriggerOutputs,
  type DynamicOutputDescriptor,
  type MergeDynamicTriggerOutputsResult,
} from "@/core/workflows/mapping/dynamicTriggerOutputs";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { OptionItem } from "@/services/options/types";

/** Why dynamic outputs are not available. Safe enums — surfaced to the user as guidance, not errors. */
export type DynamicOutputsStatus =
  /** The meta declares no dynamic source (the ~all-providers case). */
  | "not_applicable"
  /** Declared, but the driving config field is not chosen yet → "select the form first". */
  | "awaiting_selection"
  /** Resolved and merged. */
  | "resolved"
  /** The resolver failed (disconnected, scope, provider error). Static outputs still returned. */
  | "unavailable";

export interface ResolveDynamicTriggerOutputsResult extends MergeDynamicTriggerOutputsResult {
  readonly status: DynamicOutputsStatus;
  /** Safe, typed reason when `status === "unavailable"` (the resolver's own error code). */
  readonly errorCode?: string;
}

/** The options-resolver call, injected so this stays testable without the registry/network. */
export type ResolveOptionsFn = (input: {
  source: string;
  deps: Record<string, string>;
}) => Promise<readonly OptionItem[]>;

/**
 * Resolve + merge a trigger's dynamic outputs.
 *
 * `OptionItem` is the resolver's shared currency (`value` / `label` / `description`), so the mapping
 * to a descriptor is fixed here rather than per-provider: `value` IS the dot-path-safe key the
 * resolver derived (Typeform's `toAnswerKey`), and `description` carries the normalized type.
 */
export async function resolveDynamicTriggerOutputs(input: {
  meta: Pick<TriggerMeta, "payloadShape" | "dynamicOutputSource">;
  config: Readonly<Record<string, unknown>> | undefined;
  resolveOptions: ResolveOptionsFn;
}): Promise<ResolveDynamicTriggerOutputsResult> {
  const declaration = input.meta.dynamicOutputSource;
  const staticResult: MergeDynamicTriggerOutputsResult = {
    outputs: input.meta.payloadShape,
    rejectedKeys: [],
    synthesized: false,
  };

  if (!declaration) return { ...staticResult, status: "not_applicable" };

  const selected = input.config?.[declaration.configField];
  if (typeof selected !== "string" || selected.trim().length === 0) {
    return { ...staticResult, status: "awaiting_selection" };
  }

  let items: readonly OptionItem[];
  try {
    items = await input.resolveOptions({
      source: declaration.source,
      deps: { [declaration.configField]: selected.trim() },
    });
  } catch (err) {
    // Fail SOFT: the caller keeps its static outputs and can tell the user to reconnect/retry. A
    // provider outage must not make workflow guidance or readiness unusable.
    const code =
      typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string"
        ? (err as { code: string }).code
        : "PROVIDER_ERROR";
    return { ...staticResult, status: "unavailable", errorCode: code };
  }

  const descriptors: DynamicOutputDescriptor[] = items.map((item) => ({
    key: item.value,
    label: item.label,
    ...(item.description ? { type: item.description } : {}),
  }));

  return { ...mergeDynamicTriggerOutputs(input.meta, descriptors), status: "resolved" };
}
