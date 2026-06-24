"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { EMPTY_WORKFLOW_DEFINITION } from "@/contracts/workflowDefinition";
import { readAnonDraft, saveAnonDraft } from "@/lib/anonymousBuilder";
import { WorkflowBuilder } from "./WorkflowBuilder";
import { useGraphSlice } from "./state/graphSlice";
import type { ProviderOption } from "./panels/AddNodePanel";
import type { RequiredFieldsByType } from "./validation/collectBuilderValidationIssues";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

/**
 * ANON-BUILDER — local-only builder for logged-out visitors (`/start`).
 *
 * Renders the real {@link WorkflowBuilder} in `localOnly` mode against a
 * synthetic, in-memory-only workflow. NOTHING is persisted server-side:
 *   - the graph lives entirely in `graphSlice` (in-memory, no autosave),
 *   - no `accountId` / AI guidance (paid) is wired,
 *   - save / run / activate / connect are gated to sign-up by the builder.
 *
 * ANON-BUILDER-2 — the prompt + skeleton are persisted to localStorage so they
 * survive the sign-up/login round trip:
 *   - on mount we READ the stored draft (client-only, after hydration → no SSR
 *     mismatch) and hydrate the builder with it, and
 *   - we SUBSCRIBE to the graph slice and re-persist the (sanitized) skeleton on
 *     every edit, so whatever the user built is current when they hit a gate.
 *
 * After auth, `/start/continue` reads the same draft and creates a real
 * workflow. localStorage (not sessionStorage) is used so the draft also survives
 * an email-confirmation link opened in a new tab.
 */

interface Props {
  triggerProviders: readonly ProviderOption[];
  actionProviders: readonly ProviderOption[];
  requiredFieldsByType?: RequiredFieldsByType;
  setupFieldsByType?: PreviewSetupFieldsByType;
}

/**
 * Synthetic local-only workflow. The id is a non-UUID sentinel on purpose — it
 * never reaches the server (save is gated). A newer `updatedAt` is applied when
 * we hydrate a restored skeleton so the graph slice's stale-hydrate guard
 * accepts it over the initial empty mount.
 */
const LOCAL_DRAFT_ID = "local-draft";
const EPOCH = "1970-01-01T00:00:00.000Z";
const RESTORED_REVISION = "2000-01-01T00:00:00.000Z";

function baseDraft(definition: WorkflowDefinition, updatedAt: string): WorkflowDetail {
  return {
    id: LOCAL_DRAFT_ID,
    name: "Untitled workflow",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: definition,
    deletedAt: null,
    createdAt: EPOCH,
    updatedAt,
  };
}

export function AnonymousBuilder({
  triggerProviders,
  actionProviders,
  requiredFieldsByType,
  setupFieldsByType,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowDetail>(() =>
    baseDraft(EMPTY_WORKFLOW_DEFINITION, EPOCH),
  );
  // Don't start persisting until we've read any existing draft, so the initial
  // empty mount can't clobber a stored skeleton before we hydrate it.
  const readyToPersist = useRef(false);

  // Read the stored draft once (client-only) and hydrate the builder from it.
  useEffect(() => {
    const stored = readAnonDraft();
    if (stored) {
      setPrompt(stored.prompt);
      if (stored.nodes.length > 0) {
        const definition: WorkflowDefinition = {
          nodes: stored.nodes.map((n) => ({
            id: n.id,
            kind: n.kind,
            provider: n.provider,
            type: n.type,
            config: n.config ?? {},
            position: n.position ?? { x: 0, y: 0 },
            ...(n.displayName ? { displayName: n.displayName } : {}),
          })),
          edges: stored.edges.map((e) => ({
            id: e.id,
            from: e.from,
            to: e.to,
            ...(e.label ? { label: e.label } : {}),
          })),
        };
        setWorkflow(baseDraft(definition, RESTORED_REVISION));
      }
    }
    readyToPersist.current = true;
  }, []);

  // Persist the (sanitized) skeleton + prompt on every graph edit so the stored
  // draft is current when the user hits a sign-up gate.
  useEffect(() => {
    const unsubscribe = useGraphSlice.subscribe((state) => {
      if (!readyToPersist.current) return;
      saveAnonDraft({
        prompt,
        nodes: state.pendingNodes,
        edges: state.pendingEdges,
      });
    });
    return unsubscribe;
  }, [prompt]);

  return (
    <WorkflowBuilder
      workflow={workflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
      localOnly
      initialAgentPrompt={prompt}
      {...(requiredFieldsByType ? { requiredFieldsByType } : {})}
      {...(setupFieldsByType ? { setupFieldsByType } : {})}
    />
  );
}
