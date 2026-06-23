"use client";

import { useEffect, useState } from "react";
import type { WorkflowDetail } from "@/contracts/workflow";
import { EMPTY_WORKFLOW_DEFINITION } from "@/contracts/workflowDefinition";
import { readAnonPrompt } from "@/lib/anonymousBuilder";
import { WorkflowBuilder } from "./WorkflowBuilder";
import type { ProviderOption } from "./panels/AddNodePanel";
import type { RequiredFieldsByType } from "./validation/collectBuilderValidationIssues";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

/**
 * ANON-BUILDER-1 — local-only builder for logged-out visitors (`/start`).
 *
 * Renders the real {@link WorkflowBuilder} in `localOnly` mode against a
 * synthetic, in-memory-only workflow. NOTHING is persisted:
 *   - the graph lives entirely in `graphSlice` (in-memory, no autosave),
 *   - no `accountId` / AI guidance (paid) is wired,
 *   - save / run / activate / connect are gated to sign-up by the builder.
 *
 * The homepage prompt is read from sessionStorage (client-only) AFTER mount, so
 * the server render and first client render agree (no hydration mismatch) and we
 * never put the prompt in the URL.
 */

interface Props {
  triggerProviders: readonly ProviderOption[];
  actionProviders: readonly ProviderOption[];
  requiredFieldsByType?: RequiredFieldsByType;
  setupFieldsByType?: PreviewSetupFieldsByType;
}

/**
 * Synthetic local-only workflow. The id is a non-UUID sentinel on purpose — it
 * never reaches the server (save is gated), and a co-located reset clears the
 * graph slice when the builder unmounts.
 */
const LOCAL_DRAFT: WorkflowDetail = {
  id: "local-draft",
  name: "Untitled workflow",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: EMPTY_WORKFLOW_DEFINITION,
  deletedAt: null,
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export function AnonymousBuilder({
  triggerProviders,
  actionProviders,
  requiredFieldsByType,
  setupFieldsByType,
}: Props) {
  const [prompt, setPrompt] = useState("");
  useEffect(() => {
    setPrompt(readAnonPrompt());
  }, []);

  return (
    <WorkflowBuilder
      workflow={LOCAL_DRAFT}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
      localOnly
      initialAgentPrompt={prompt}
      {...(requiredFieldsByType ? { requiredFieldsByType } : {})}
      {...(setupFieldsByType ? { setupFieldsByType } : {})}
    />
  );
}
