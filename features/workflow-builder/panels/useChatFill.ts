"use client";

import { useCallback, useState } from "react";
import {
  applyChatFillToDraft,
  prepareChatFill,
  type ChatFillProposal,
  type ChatFillResult,
} from "../ai/chatFillAction";
import { extractChatFillValue } from "../ai/extractChatFillValue";
import type { ChatFillTarget } from "../ai/useChatFillTarget";
import { nextChatMessageId, type ChatMessage, type ChatMessageId } from "./_BuilderAiPanelChat";

/**
 * Slice 4.AI-CONFIG-ASSIST-3 — chat-fill orchestration.
 *
 * Turns an explicit chat-typed value into a pending-fill PROPOSAL bubble, and on
 * Confirm writes the value to the pending config DRAFT via CS-2
 * `applyChatFillToDraft` (the same path manual typing uses). NO save, run, graph
 * mutation, WorkflowPatch, or Apply. All guardrails are CS-1/CS-2; copy is safe
 * (never echoes a secret value or a raw key).
 *
 * `confirmFill` re-resolves the LIVE target (via `getCurrentTarget`) and rejects
 * if the highlighted field changed since the proposal — so a stale bubble can't
 * fill the wrong field.
 */

export interface UseChatFillInput {
  readonly appendMessage: (message: ChatMessage) => void;
  /** Returns the currently-highlighted target (live), or null. */
  readonly getCurrentTarget: () => ChatFillTarget | null;
}

const AMBIGUOUS_COPY =
  "I couldn’t tell the exact value to use. Type just the value, or wrap it in quotes — e.g. “hello from ChainReact”.";

const STALE_TARGET_COPY =
  "That field isn’t available anymore — open the field again, then type the value.";

/** Safe, no-leak copy per failure reason. Never echoes the value or the raw key. */
function safeFailureCopy(result: Extract<ChatFillResult, { ok: false }>): string {
  switch (result.reason) {
    case "STALE_NODE_TARGET":
    case "STALE_FIELD_TARGET":
    case "TARGET_NOT_HIGHLIGHTED":
      return STALE_TARGET_COPY;
    case "FIELD_NOT_ELIGIBLE":
      switch (result.eligibilityReason) {
        case "SECRET_FIELD":
          return "This field holds sensitive data and can’t be auto-filled — enter it directly in the field.";
        case "RECIPIENT_OR_DESTINATION_FIELD":
          return "Recipient/destination fields can’t be auto-filled from chat — set them directly in the field.";
        case "DESTRUCTIVE_ACTION":
        case "CONFIRMATION_REQUIRED_ACTION":
          return "This action needs careful review — fill its fields directly in the config panel.";
        case "UNSUPPORTED_FIELD_TYPE":
          return "This field type can’t be auto-filled from chat — edit it directly in the field.";
        case "MISSING_FIELD_METADATA":
          return STALE_TARGET_COPY;
      }
      return STALE_TARGET_COPY;
    case "VALUE_INVALID":
      switch (result.valueReason) {
        case "EMPTY_VALUE":
          return "Please type the value to place in the field.";
        case "VALUE_TOO_LONG":
          return "That value is too long to place automatically — shorten it or edit the field directly.";
        case "NON_STRING_VALUE":
          return "Please type a text value.";
      }
      return STALE_TARGET_COPY;
  }
}

function blockedMessage(message: string): ChatMessage {
  return { id: nextChatMessageId(), role: "assistant", kind: "chat_fill", fill: { phase: "blocked", message } };
}

function proposalMessage(proposal: ChatFillProposal): ChatMessage {
  return { id: nextChatMessageId(), role: "assistant", kind: "chat_fill", fill: { phase: "proposal", proposal } };
}

function summaryMessage(proposal: ChatFillProposal): ChatMessage {
  return { id: nextChatMessageId(), role: "assistant", kind: "chat_fill", fill: { phase: "summary", proposal } };
}

export interface UseChatFillResult {
  /** Proposal ids already confirmed/cancelled (buttons disable). */
  readonly resolvedFillIds: ReadonlySet<ChatMessageId>;
  /**
   * Slice 4.AI-CONFIG-ASSIST CS-9 — DIRECT fill for the active highlighted field.
   * Writes the pending draft immediately + appends an after-fill SUMMARY (no
   * Confirm/Cancel proposal). The product path for "field highlighted → type → Send".
   */
  readonly fillNow: (target: ChatFillTarget, rawMessage: string) => void;
  /**
   * Turn an explicit chat message into a pending-fill PROPOSAL (Confirm/Cancel) or
   * safe guidance. Retained for a future non-direct / ambiguous path — NOT used by
   * the current highlighted-field direct-fill path (which uses `fillNow`).
   */
  readonly propose: (target: ChatFillTarget, rawMessage: string) => void;
  /** Confirm a proposal → write the pending draft + append a summary. Re-validates live. */
  readonly confirmFill: (messageId: ChatMessageId, proposal: ChatFillProposal) => void;
  /** Cancel a proposal → no write; mark it resolved. */
  readonly cancelFill: (messageId: ChatMessageId) => void;
}

export function useChatFill({ appendMessage, getCurrentTarget }: UseChatFillInput): UseChatFillResult {
  const [resolvedFillIds, setResolvedFillIds] = useState<ReadonlySet<ChatMessageId>>(new Set());

  const markResolved = useCallback((messageId: ChatMessageId) => {
    setResolvedFillIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  }, []);

  /**
   * Slice 4.AI-CONFIG-ASSIST CS-9 — DIRECT fill. The composer is already in an
   * explicit field-fill mode (an eligible field is highlighted + the user pressed
   * Send), so there's no proposal to confirm: echo the user's message, write the
   * pending DRAFT immediately via CS-2 `applyChatFillToDraft`, then append an
   * after-fill SUMMARY ("Filled … · Not saved yet"). Ambiguous input / an
   * ineligible field / an invalid value still fall back to safe guidance with NO
   * write — never a Confirm/Cancel proposal. The ONLY side effect on success is the
   * draft write: no `graphSlice.updateNodeConfig`, no save, no run, no Apply.
   */
  const fillNow = useCallback(
    (target: ChatFillTarget, rawMessage: string) => {
      const extraction = extractChatFillValue(rawMessage);
      if (extraction.kind === "ambiguous") {
        appendMessage(blockedMessage(AMBIGUOUS_COPY));
        return;
      }
      const result = applyChatFillToDraft({
        nodeId: target.nodeId,
        fieldKey: target.fieldKey,
        field: target.field,
        ...(target.action ? { action: target.action } : {}),
        value: extraction.value,
        currentValue: target.currentValue,
        nodeLabel: target.nodeLabel,
        fieldLabel: target.fieldLabel,
        nodeExists: true,
        highlightedFieldKey: target.fieldKey,
        requireHighlightMatch: true,
      });
      if (!result.ok) {
        // Ineligible / invalid / stale → safe guidance, NO write, NO echo (so a
        // blocked secret/recipient value never lands in the chat log).
        appendMessage(blockedMessage(safeFailureCopy(result)));
        return;
      }
      // Success: the value was placed in the eligible field. Echo the user's sent
      // message (a non-persisted gesture, not a planner prompt), then the after-fill
      // summary — chronological order: user message, then "Filled … · Not saved yet".
      appendMessage({ id: nextChatMessageId(), role: "user", kind: "action", content: rawMessage });
      appendMessage(summaryMessage(result.proposal));
    },
    [appendMessage],
  );

  const propose = useCallback(
    (target: ChatFillTarget, rawMessage: string) => {
      const extraction = extractChatFillValue(rawMessage);
      if (extraction.kind === "ambiguous") {
        appendMessage(blockedMessage(AMBIGUOUS_COPY));
        return;
      }
      const result = prepareChatFill({
        nodeId: target.nodeId,
        fieldKey: target.fieldKey,
        field: target.field,
        ...(target.action ? { action: target.action } : {}),
        value: extraction.value,
        currentValue: target.currentValue,
        nodeLabel: target.nodeLabel,
        fieldLabel: target.fieldLabel,
        nodeExists: true,
        highlightedFieldKey: target.fieldKey,
        requireHighlightMatch: true,
      });
      appendMessage(result.ok ? proposalMessage(result.proposal) : blockedMessage(safeFailureCopy(result)));
    },
    [appendMessage],
  );

  const confirmFill = useCallback(
    (messageId: ChatMessageId, proposal: ChatFillProposal) => {
      markResolved(messageId);
      const target = getCurrentTarget();
      // The highlighted field must still be the one the proposal was for.
      if (
        !target ||
        !target.field ||
        target.nodeId !== proposal.nodeId ||
        target.fieldKey !== proposal.fieldKey
      ) {
        appendMessage(blockedMessage(STALE_TARGET_COPY));
        return;
      }
      const result = applyChatFillToDraft({
        nodeId: target.nodeId,
        fieldKey: target.fieldKey,
        field: target.field,
        ...(target.action ? { action: target.action } : {}),
        value: proposal.newValue,
        currentValue: target.currentValue,
        nodeLabel: target.nodeLabel,
        fieldLabel: target.fieldLabel,
        nodeExists: true,
        highlightedFieldKey: target.fieldKey,
        requireHighlightMatch: true,
      });
      appendMessage(result.ok ? summaryMessage(result.proposal) : blockedMessage(safeFailureCopy(result)));
    },
    [appendMessage, getCurrentTarget, markResolved],
  );

  const cancelFill = useCallback(
    (messageId: ChatMessageId) => {
      markResolved(messageId);
    },
    [markResolved],
  );

  return { resolvedFillIds, fillNow, propose, confirmFill, cancelFill };
}
