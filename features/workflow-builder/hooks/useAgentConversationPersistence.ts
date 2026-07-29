"use client";

import { useMemo } from "react";
import type {
  AgentMessageKind,
  AgentMessageRole,
  AppendAgentMessageRequest,
  PersistedAgentMessage,
} from "@/contracts/builderAgentMessage";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import {
  appendBuilderAgentMessage,
  getBuilderAgentThread,
} from "@/lib/api/builderAgentThread";
import type {
  GuidanceChatMessage,
  GuidanceConversationPersistence,
} from "@/features/workflows/useGuidanceConversation";

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the builder's adapter between the
 * React Agent transcript and the stored `builder_agent_messages` rows.
 *
 * This is the ONLY place that translates between the two shapes, and it is a
 * deliberately narrow, lossy-in-one-direction mapping:
 *
 *   - Storing keeps the user-visible text, the structured proposal, the
 *     lifecycle reference, and the base draft revision. It stores no guided
 *     stage, no popup/session UI state, and no model prompt.
 *   - Restoring marks every turn `restored`, which is what stops history from
 *     behaving like a live proposal (no auto-show, no guided stage, no implicit
 *     Apply). Reopening a restored proposal is always an explicit user action.
 *
 * Every call is deterministic database work through the typed client — no model
 * call, no AI gateway, no credits. Writes are fire-and-forget: the transcript is
 * a record of the conversation, never a precondition for it.
 */

/** The chat roles collapse onto the two stored roles; `kind` carries the rest. */
function toStoredRoleKind(
  message: GuidanceChatMessage,
): { role: AgentMessageRole; kind: AgentMessageKind } {
  switch (message.role) {
    case "user":
      return { role: "user", kind: "prompt" };
    case "assistant":
      return { role: "assistant", kind: "plan_result" };
    case "review":
      return { role: "assistant", kind: "review" };
    case "error":
      return { role: "assistant", kind: "error" };
  }
}

/**
 * The structured proposal we persist for an assistant turn.
 *
 * `plan` + `preview` are what the transcript needs to describe the suggestion;
 * `definition` is what a reopen needs to put the SAME graph back on the canvas.
 * Storing the preview without the definition would produce a card that describes
 * one change and applies another, so they travel together or not at all.
 */
function toStoredProposal(
  message: Extract<GuidanceChatMessage, { role: "assistant" }>,
): Record<string, unknown> | null {
  if (!message.plan && !message.preview) return null;
  return {
    ...(message.plan ? { plan: message.plan } : {}),
    ...(message.preview ? { preview: message.preview } : {}),
    ...(message.proposedDefinition ? { definition: message.proposedDefinition } : {}),
    ...(message.warnings && message.warnings.length ? { warnings: message.warnings } : {}),
    ...(message.prompt ? { prompt: message.prompt } : {}),
  };
}

function toAppendRequest(
  message: GuidanceChatMessage,
  requestId: string | null,
): AppendAgentMessageRequest {
  const { role, kind } = toStoredRoleKind(message);
  const proposal =
    message.role === "assistant" ? toStoredProposal(message) : null;
  return {
    role,
    kind,
    content: message.text,
    // The message id is stable within a session, so it doubles as the write's
    // idempotency key: a retried append for the same turn is a no-op server-side.
    clientMessageId: `m:${message.id}`,
    ...(requestId ? { requestId } : {}),
    ...(message.role === "assistant" && message.agentChangeId
      ? { agentChangeId: message.agentChangeId }
      : {}),
    ...(message.role === "assistant" && message.baseGraphVersion
      ? { baseGraphVersion: message.baseGraphVersion }
      : {}),
    ...(proposal ? { proposal } : {}),
  };
}

/** Read one optional object off the stored proposal without trusting its shape. */
function proposalPart<T>(
  proposal: Readonly<Record<string, unknown>> | null,
  key: string,
): T | null {
  if (!proposal) return null;
  const value = proposal[key];
  if (!value || typeof value !== "object") return null;
  return value as T;
}

export function toChatMessage(row: PersistedAgentMessage): GuidanceChatMessage | null {
  const id = `p:${row.id}`;
  const text = row.content ?? "";
  if (row.role === "user") {
    return { id, role: "user", text, restored: true };
  }
  if (row.kind === "error") {
    return { id, role: "error", text, restored: true };
  }
  if (row.kind === "review") {
    // Setup targets are recomputed live from the CURRENT draft, never restored:
    // a stored target would point at fields whose state has since changed. The
    // restored review is the text record of what was said.
    return { id, role: "review", text, setupTargets: [], restored: true };
  }
  const proposal = row.proposal;
  const plan = proposalPart<WorkflowPlan>(proposal, "plan");
  const preview = proposalPart<DraftPreview>(proposal, "preview");
  const definition = proposalPart<WorkflowDefinition>(proposal, "definition");
  const promptValue = proposal?.["prompt"];
  const warningsValue = proposal?.["warnings"];
  return {
    id,
    role: "assistant",
    text,
    plan,
    preview,
    restored: true,
    ...(typeof promptValue === "string" ? { prompt: promptValue } : {}),
    ...(definition ? { proposedDefinition: definition } : {}),
    ...(row.baseGraphVersion ? { baseGraphVersion: row.baseGraphVersion } : {}),
    ...(row.agentChangeId ? { agentChangeId: row.agentChangeId } : {}),
    ...(Array.isArray(warningsValue)
      ? { warnings: warningsValue.filter((w): w is string => typeof w === "string") }
      : {}),
  };
}

export interface UseAgentConversationPersistenceInput {
  readonly workflowId: string;
  /** The logged-out local-only builder has no server workflow and no thread. */
  readonly enabled: boolean;
}

export function useAgentConversationPersistence(
  input: UseAgentConversationPersistenceInput,
): GuidanceConversationPersistence | undefined {
  const { workflowId, enabled } = input;
  return useMemo<GuidanceConversationPersistence | undefined>(() => {
    if (!enabled) return undefined;
    return {
      async load() {
        const res = await getBuilderAgentThread(workflowId);
        return res.messages
          .map(toChatMessage)
          .filter((m): m is GuidanceChatMessage => m !== null);
      },
      append(message, meta) {
        void appendBuilderAgentMessage(
          workflowId,
          toAppendRequest(message, meta.requestId),
        ).catch(() => {
          // Fail-open: a transcript that couldn't be written must never break,
          // block, or re-issue the conversation it was recording.
        });
      },
    };
  }, [workflowId, enabled]);
}
