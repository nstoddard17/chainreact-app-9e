/**
 * Pure visibility helper for the edge insert plus-button
 * (Slice 4.BUILDER-ADD-FLOW-1).
 *
 * The plus-button only makes sense when:
 *   - The edge is not currently being dragged / reordered.
 *   - The graph isn't mid-save (clicking during a save would mutate
 *     state the save engine has already serialised).
 *   - A target exists for the insert (the edge has a known target node;
 *     defensive against transient ReactFlow shapes during connect
 *     events).
 *
 * No knowledge of providers / categories / metadata — this is pure
 * graph-state policy.
 */

export interface ShouldShowPlusButtonInput {
  /** True while ReactFlow is mid-drag of the edge or one of its endpoints. */
  isDragging?: boolean;
  /** True while graphSlice.save() is in flight. */
  isSaving?: boolean;
  /** Set true once the edge has both a source + target id. */
  hasResolvedEndpoints?: boolean;
}

export function shouldShowPlusButton(
  input: ShouldShowPlusButtonInput,
): boolean {
  if (input.isDragging === true) return false;
  if (input.isSaving === true) return false;
  if (input.hasResolvedEndpoints === false) return false;
  return true;
}
