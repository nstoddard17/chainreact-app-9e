/**
 * Document Builder module boundary (5.DUAL-BUILDER-1 / CS-1).
 *
 * Everything the rest of the builder needs from `document/` goes through this
 * barrel. Nothing in this folder imports React Flow (`@xyflow/react`) — locked
 * by tests/structure/document-builder-no-react-flow.test.ts.
 */
export { DocumentView } from "./DocumentView";
export {
  projectDefinitionToDocument,
  type DocumentBlock,
  type DocumentBlankChip,
  type DocumentComplexRegionBlock,
  type DocumentForkBlock,
  type DocumentForkLane,
  type DocumentModel,
  type DocumentProjectionInput,
  type DocumentSentenceBlock,
  type DocumentValueChip,
  type ProjectionWarning,
} from "./projection";
export {
  MAX_FORK_DEPTH,
  complexRegionMessage,
  findCycle,
  type ComplexRegionReason,
} from "./projectionTiers";
export {
  readBuilderViewPref,
  writeBuilderViewPref,
  type BuilderViewMode,
} from "./documentViewPref";
export {
  cancelDocumentField,
  commitDocumentField,
  describeDocumentRefusal,
  guardDocumentActionMeta,
  openDocumentStepConfig,
  validateDocumentEdgeInsertion,
  validateDocumentTailAdd,
  type DocumentCommandRefusal,
  type DocumentCommandResult,
} from "./documentCommands";
export { planGuidedStop, type GuidedStopPlan } from "./guidedStopModel";
export {
  buildDocumentOutline,
  type OutlineRow,
  type OutlineRowKind,
} from "./documentOutline";
export {
  buildSetupQueue,
  deriveSetupBannerState,
  type SetupQueue,
  type SetupQueueItem,
  type SetupQueueHandoff,
  type SetupBannerState,
  type SetupBannerPrimary,
  type SetupHandoffReason,
} from "./setupQueueModel";
export {
  buildWholeWorkflowMap,
  type WholeWorkflowMap as WholeWorkflowMapModel,
  type WholeWorkflowMapRow,
  type MapStatus,
} from "./wholeWorkflowMapModel";
export {
  resolveMapRowNavigation,
  type DocumentNavOutcome,
  type DocumentNavRefusal,
} from "./documentNavigation";
export {
  groupBlocksIntoSections,
  summarizeDocumentSection,
  blockOwnedNodeIds,
  blockPrimaryNodeId,
  type DocumentSection,
  type SectionedRow,
  type SectionedDocument,
  type SectionSummary,
} from "./documentSections";
export {
  resolveWrapSelection,
  resolveBlockNodeIds,
  describeSectionRefusal,
  type SectionSelectionResult,
  type SectionSelectionRefusal,
} from "./documentSectionCommands";
