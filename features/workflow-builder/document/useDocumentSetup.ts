"use client";

import { useCallback, useMemo, useRef, type MutableRefObject } from "react";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { WorkflowPresentation } from "@/contracts/workflowPresentation";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import {
  collectBuilderValidationIssues,
  countBuilderValidationIssues,
} from "../validation/collectBuilderValidationIssues";
import { buildDocumentOutline } from "./documentOutline";
import {
  buildSetupQueue,
  deriveSetupBannerState,
  type SetupBannerState,
  type SetupQueue,
} from "./setupQueueModel";
import {
  buildWholeWorkflowMap,
  type WholeWorkflowMap,
} from "./wholeWorkflowMapModel";
import { useFinishSetupQueue, type FinishSetupQueueApi } from "./useFinishSetupQueue";
import type { GuidedStopTarget } from "./useDocumentGuidedStop";
import type { DocumentModel } from "./projection";
import type { DocumentNavRefusal } from "./documentNavigation";

/**
 * 5.DUAL-BUILDER-1 CS-3 — the Document setup orchestration.
 *
 * Derives the Finish Setup queue, the Whole Workflow map, and the banner state
 * from the SAME authoritative signals as the header issues pill
 * (`collectBuilderValidationIssues`) + the pure Document outline (order +
 * branch/lane context), and wires the live queue session to the shared Guided
 * Stop. Extracted from `DocumentView` so the surface component stays focused on
 * rendering; there is no second readiness system here.
 */
export function useDocumentSetup(input: {
  model: DocumentModel;
  pendingNodes: readonly WorkflowNode[];
  pendingEdges: readonly WorkflowEdge[];
  requiredFieldsByType?: RequiredFieldsByType | undefined;
  isDirty: boolean;
  stop: GuidedStopTarget | null;
  /** CS-4 — manual section metadata, so the queue + map understand sections. */
  presentation?: WorkflowPresentation | null | undefined;
  openStop: (nodeId: string, fieldKey: string) => unknown;
  releaseStop: () => void;
}): {
  bannerState: SetupBannerState;
  wholeMap: WholeWorkflowMap;
  finishSetup: FinishSetupQueueApi;
  queue: SetupQueue;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  scrollToNode: (nodeId: string) => void;
} {
  const {
    model,
    pendingNodes,
    pendingEdges,
    requiredFieldsByType,
    isDirty,
    stop,
    presentation,
    openStop,
    releaseStop,
  } = input;

  const issues = useMemo(
    () =>
      collectBuilderValidationIssues({
        pendingNodes,
        pendingEdges,
        ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
      }),
    [pendingNodes, pendingEdges, requiredFieldsByType],
  );
  const outline = useMemo(() => buildDocumentOutline(model), [model]);
  const setupQueueData = useMemo(
    () => buildSetupQueue({ outline, issues, presentation: presentation ?? null }),
    [outline, issues, presentation],
  );
  const wholeMap = useMemo(
    () =>
      buildWholeWorkflowMap({
        outline,
        issues,
        queue: setupQueueData,
        presentation: presentation ?? null,
      }),
    [outline, issues, setupQueueData, presentation],
  );
  const bannerState = useMemo(
    () =>
      deriveSetupBannerState({
        queue: setupQueueData,
        blockingErrorCount: countBuilderValidationIssues(issues).errorCount,
        isDirty,
      }),
    [setupQueueData, issues, isDirty],
  );

  const finishSetup = useFinishSetupQueue({
    queue: setupQueueData,
    stop,
    openStop,
    releaseStop,
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollToNode = useCallback((nodeId: string) => {
    const el = scrollRef.current?.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`);
    if (el && typeof (el as HTMLElement).scrollIntoView === "function") {
      const reduce =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      (el as HTMLElement).scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
  }, []);

  return { bannerState, wholeMap, finishSetup, queue: setupQueueData, scrollRef, scrollToNode };
}

/** Plain-language copy for a refused map navigation (never a raw error). */
export function navRefusalCopy(reason: DocumentNavRefusal): string {
  switch (reason) {
    case "stale_node":
      return "That step isn't here anymore — it may have been removed.";
    case "structural_connector":
    case "no_target":
      return "There's nothing to open here.";
  }
}

/** Minimal attribute-selector escape (CSS.escape when available). */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
