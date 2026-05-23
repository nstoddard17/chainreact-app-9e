import type { HubSpotPipeline, HubSpotPipelineStage } from "@/integrations/_shared/hubspot/api/pipelines";
import type { OptionItem } from "@/services/options/types";

/**
 * Shared pipeline / stage mapping used by the four HubSpot
 * pipeline-flavored resolvers (`hubspot:deal_pipelines`,
 * `hubspot:deal_stages`, `hubspot:ticket_pipelines`,
 * `hubspot:ticket_stages`). Lives here so all four resolvers stay
 * shape-consistent and a future operator that wants to add a Q11-style
 * stage-probability hint only edits one place.
 *
 * Mapping shape:
 *   - `value`: HubSpot pipeline / stage id.
 *   - `label`: HubSpot `label` (the human-meaningful display name).
 *     Falls back to the id when label is absent (defensive — the
 *     HubSpot API always returns label in practice).
 *   - `description`: omitted for v1. Pipelines have no meaningful
 *     description; stages carry `displayOrder` + `metadata.probability`
 *     but exposing those in the picker tends to confuse rather than
 *     help. Future polish slice can add per-shape descriptions
 *     without churning the resolver contract.
 *
 * Both helpers preserve HubSpot's natural order:
 *   - Pipelines come back in the order `pipelines.list` returns them
 *     (HubSpot's documented order is by displayOrder asc, then id
 *     asc); we trust the API.
 *   - Stages within a pipeline come back in the order they appear on
 *     the pipeline's `stages[]` array — workflow authors' mental model
 *     is "the first stage", "the last stage" by position, not by id.
 *
 * Archived pipelines / stages are filtered out — the picker should
 * never surface deactivated entries.
 */

function pickLabel(label: string | null | undefined, id: string): string {
  if (typeof label === "string" && label.length > 0) return label;
  return id;
}

export function mapPipelineToOption(pipeline: HubSpotPipeline): OptionItem | null {
  if (typeof pipeline.id !== "string" || pipeline.id.length === 0) return null;
  if (pipeline.archived === true) return null;
  return {
    value: pipeline.id,
    label: pickLabel(pipeline.label ?? null, pipeline.id),
  };
}

export function mapStageToOption(stage: HubSpotPipelineStage): OptionItem | null {
  if (typeof stage.id !== "string" || stage.id.length === 0) return null;
  if (stage.archived === true) return null;
  return {
    value: stage.id,
    label: pickLabel(stage.label ?? null, stage.id),
  };
}

/**
 * Filter pipeline list by id (string-equal). Returns the matching
 * pipeline OR null. Used by the stage resolvers (`hubspot:deal_stages`
 * + `hubspot:ticket_stages`) to scope to the picker's selected
 * pipeline.
 */
export function findPipelineById(
  pipelines: ReadonlyArray<HubSpotPipeline>,
  pipelineId: string,
): HubSpotPipeline | null {
  for (const p of pipelines) {
    if (p.id === pipelineId) return p;
  }
  return null;
}
