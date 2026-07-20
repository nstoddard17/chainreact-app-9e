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
