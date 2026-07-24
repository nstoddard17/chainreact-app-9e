import type { UserDefinedSchema } from "@/contracts/aiProcessing";
import {
  deriveDestinationContext,
  type DestinationContext,
  type DestinationExcludedField,
} from "@/core/workflows/deriveDestinationContext";
import { getActionMeta } from "@/services/discovery/_registry";
import { AI_PROVIDER_ID } from "@/core/integrations/connectionlessProviders";
import { DestinationResolutionError } from "./analysisErrors";

/**
 * Destination resolution for `ai:transform_data` (AI-PROVIDER-6 CS-6).
 *
 * Turns the author's destination CHOICE into the two things the processor
 * needs: the enforced output schema and the advisory model context.
 *
 * **The server re-derives from the live registry — always.** The builder never
 * sends a schema for the destination-action mode; only the action KEY crosses
 * the wire. A client-supplied schema copy would be both a trust problem (it
 * decides what the model is allowed to emit) and a staleness problem (a
 * provider slice can change a destination's fields between save and run).
 *
 * Failure posture: every refusal is a typed `DestinationResolutionError` whose
 * message tells the author what to do next — never a bare "invalid config".
 */

export type TransformDestinationMode = "action" | "custom";

export interface ResolvedTransformDestination {
  readonly mode: TransformDestinationMode;
  /** The enforced output contract. */
  readonly schema: UserDefinedSchema;
  /** Advisory mapping context. Absent for the custom-schema mode. */
  readonly context?: DestinationContext;
  /** Destination action key, when the destination is an action. */
  readonly actionKey?: string;
  /** Destination fields phase 1 cannot map — surfaced as run warnings. */
  readonly excludedFields: readonly DestinationExcludedField[];
}

export interface ResolveTransformDestinationInput {
  readonly destinationMode: TransformDestinationMode;
  readonly destinationAction?: string | undefined;
  readonly destinationSchema?: UserDefinedSchema | undefined;
}

export interface ResolveTransformDestinationDeps {
  /** Injected in tests; production always reads the real discovery registry. */
  readonly lookupActionMeta?: typeof getActionMeta;
}

/** Warning code prefix for a destination field this transform cannot fill. */
export const DESTINATION_EXCLUDED_WARNING_PREFIX = "destination_field_skipped:";

export function resolveTransformDestination(
  input: ResolveTransformDestinationInput,
  deps: ResolveTransformDestinationDeps = {},
): ResolvedTransformDestination {
  if (input.destinationMode === "custom") {
    const schema = input.destinationSchema;
    if (!schema || schema.fields.length === 0) {
      throw new DestinationResolutionError(
        "Add at least one field for the transformed data.",
      );
    }
    return { mode: "custom", schema, excludedFields: [] };
  }

  const actionKey = input.destinationAction?.trim();
  if (!actionKey) {
    throw new DestinationResolutionError(
      "Choose the step this data should be transformed for.",
    );
  }

  // Transforming INTO an AI action is a cost loop with no product meaning, and
  // the picker never offers one — so a key that arrives here is hand-authored
  // or stale. Refuse explicitly rather than letting it look supported.
  if (actionKey.startsWith(`${AI_PROVIDER_ID}:`)) {
    throw new DestinationResolutionError(
      "ChainReact AI steps can't be used as a transform destination. Pick the app step this data is headed for.",
    );
  }

  const meta = (deps.lookupActionMeta ?? getActionMeta)(actionKey);
  if (!meta) {
    throw new DestinationResolutionError(
      "That destination step isn't available anymore. Pick the step this data is headed for.",
    );
  }

  const derived = deriveDestinationContext(meta);
  if (!derived.schema) {
    throw new DestinationResolutionError(
      `${meta.displayName} has no fields this step can fill in automatically. Pick a different destination, or define the fields manually.`,
    );
  }

  return {
    mode: "action",
    schema: derived.schema,
    context: derived.context,
    actionKey,
    excludedFields: derived.context.excludedFields,
  };
}

/** Machine-readable run warnings for the destination fields left unfilled. */
export function destinationWarnings(
  excludedFields: readonly DestinationExcludedField[],
): string[] {
  return excludedFields.map(
    (field) => `${DESTINATION_EXCLUDED_WARNING_PREFIX}${field.name}:${field.reason}`,
  );
}
