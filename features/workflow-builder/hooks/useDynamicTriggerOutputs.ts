"use client";

import { useMemo } from "react";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { OutputMeta } from "@/contracts/actionMeta";
import {
  mergeDynamicTriggerOutputs,
  type DynamicOutputDescriptor,
} from "@/core/workflows/mapping/dynamicTriggerOutputs";
import { useOptionsSource } from "./useOptionsSource";

/**
 * Client resolution of resolver-backed dynamic TRIGGER outputs
 * (TYPEFORM-DYNAMIC-OUTPUTS-UI-AND-AGENT-CLOSEOUT-1).
 *
 * Turns a trigger node's `dynamicOutputSource` declaration + its committed config into the merged
 * output tree the variable picker and Data Map render. It is the CLIENT half of a contract whose
 * server half is `services/discovery/dynamicTriggerOutputs`; both end at the same pure merger in
 * `core/`, so a path offered in the picker is exactly the path the agent proposes and the runtime
 * emits. Building a second key generator here is the one thing that would break the whole arc.
 *
 * Everything hard is DELEGATED rather than reimplemented. `useOptionsSource` already owns:
 *   - the authenticated, account-scoped fetch to `/api/options/[source]`;
 *   - the loading / ready / empty / error / disconnected / owner-gated state machine;
 *   - `refetch` for a retry button;
 *   - abort-on-change, which is also the STALE-RESPONSE guard: switching from form A to form B
 *     aborts A's in-flight request, so a late A response can never overwrite B's outputs.
 * Reusing it is why this file is small, and why the builder's error UX here is automatically the
 * same one every other resolver-backed field already has.
 *
 * Hook profile is fixed: `useOptionsSource` is called exactly once per render with `source: null`
 * when the trigger has no declaration or its config field is unset, so it never fetches in those
 * cases and the Rules of Hooks hold regardless of which node is selected.
 */

/** What the builder needs to render the right state next to a schema-dependent trigger. */
export type DynamicTriggerOutputsStatus =
  /** No declaration — the ordinary case for almost every trigger. */
  | "not_applicable"
  /** Declared, but the driving config field is unset → "select the form first". */
  | "waiting_for_config"
  | "loading"
  | "ready"
  /** Resolved successfully but the resource has no usable questions. */
  | "empty"
  /** Transient/provider failure — a retry is meaningful. */
  | "retryable_error"
  /** The integration needs reconnecting or re-consent — retry would fail identically. */
  | "reconnect_required"
  /** The selected resource is gone (deleted form) — the fix is choosing another. */
  | "not_found";

export interface UseDynamicTriggerOutputsResult {
  /** Static outputs merged with the resolved dynamic children (static by reference when none). */
  readonly outputs: readonly OutputMeta[];
  readonly status: DynamicTriggerOutputsStatus;
  /** Safe, user-facing copy for the non-ready states. Never a raw provider error. */
  readonly message: string | null;
  /** Keys the merger refused (unsafe/duplicate) — surfaced so bad schemas fail visibly. */
  readonly rejectedKeys: readonly string[];
  /** Retry the resolve. No-op unless `status === "retryable_error"`. */
  readonly retry: () => void;
}

const NO_KEYS: readonly string[] = Object.freeze([]);

/**
 * Resolve + merge one trigger node's dynamic outputs.
 *
 * `meta` may be undefined while its catalog is still loading; the hook then reports
 * `not_applicable` with no outputs rather than guessing, and re-runs when the meta arrives.
 */
export function useDynamicTriggerOutputs(input: {
  readonly meta: Pick<TriggerMeta, "payloadShape" | "dynamicOutputSource"> | undefined;
  readonly config: Readonly<Record<string, unknown>> | undefined;
  readonly workflowId?: string | undefined;
  readonly nodeId?: string | undefined;
}): UseDynamicTriggerOutputsResult {
  const declaration = input.meta?.dynamicOutputSource;
  const selected = declaration ? input.config?.[declaration.configField] : undefined;
  const selectedValue = typeof selected === "string" ? selected.trim() : "";
  const hasSelection = declaration !== undefined && selectedValue.length > 0;

  // Stable deps object identity per selected value, so the fetch effect keys on the VALUE and not on
  // a fresh object every render (which would resolve on every render — explicitly forbidden).
  const deps = useMemo(
    () => (declaration && hasSelection ? { [declaration.configField]: selectedValue } : undefined),
    [declaration, hasSelection, selectedValue],
  );

  const optionsResult = useOptionsSource({
    // `null` disables the hook entirely: no request when there is no declaration or no selection.
    source: hasSelection && declaration ? declaration.source : null,
    ...(deps ? { deps } : {}),
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
    ...(input.nodeId !== undefined ? { nodeId: input.nodeId } : {}),
  });

  return useMemo<UseDynamicTriggerOutputsResult>(() => {
    const staticOutputs = input.meta?.payloadShape ?? [];
    const base = {
      outputs: staticOutputs,
      message: null,
      rejectedKeys: NO_KEYS,
      retry: optionsResult?.refetch ?? (() => {}),
    };

    if (!declaration) return { ...base, status: "not_applicable" };
    if (!hasSelection) {
      return {
        ...base,
        status: "waiting_for_config",
        // Generic on purpose: the same copy serves a form, a sheet, a board or a database.
        message: "Select the source above first so its fields can be mapped.",
      };
    }

    // Defensive: a disabled (`source: null`) call may legitimately yield nothing to read. Treat an
    // absent state as "still loading" rather than crashing the whole variable picker.
    const state = optionsResult?.state;
    if (!state) return { ...base, status: "loading" };
    switch (state.status) {
      case "idle":
      case "loading":
        return { ...base, status: "loading" };
      case "disconnected":
        return { ...base, status: "reconnect_required", message: state.message };
      case "owner-gated":
      case "owner-must-connect":
      case "needs-reconnect":
        // Owner-gated / re-consent states are not retryable: refetch returns the same code. The
        // actionable fix is a person (connect, or ask the owner), so they share the reconnect state.
        return { ...base, status: "reconnect_required", message: state.message };
      case "error": {
        // NOT_FOUND means the chosen resource is gone — retrying cannot fix that, choosing another can.
        const isMissing = state.code === "SOURCE_NOT_FOUND" || state.code === "MISSING_DEPENDENCY";
        return {
          ...base,
          status: isMissing ? "not_found" : "retryable_error",
          message: state.message,
        };
      }
      case "empty":
        return {
          ...base,
          status: "empty",
          message: "This source has no fields that can be mapped.",
        };
      case "ready":
      default: {
        const descriptors: DynamicOutputDescriptor[] = state.items.map((item) => ({
          key: item.value,
          label: item.label,
          ...(item.description ? { type: item.description } : {}),
        }));
        const merged = mergeDynamicTriggerOutputs(
          { payloadShape: staticOutputs, dynamicOutputSource: declaration },
          descriptors,
        );
        return {
          outputs: merged.outputs,
          status: "ready",
          message:
            merged.rejectedKeys.length > 0
              ? `${merged.rejectedKeys.length} field(s) couldn't be mapped because their identifiers aren't usable.`
              : null,
          rejectedKeys: merged.rejectedKeys,
          retry: optionsResult?.refetch ?? (() => {}),
        };
      }
    }
  }, [declaration, hasSelection, input.meta?.payloadShape, optionsResult?.state, optionsResult?.refetch]);
}
