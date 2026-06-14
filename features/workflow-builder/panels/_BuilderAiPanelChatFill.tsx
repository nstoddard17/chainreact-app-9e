"use client";

import { Button } from "@/components/ui/button";
import type { AssistantChatFillChatMessage } from "./_BuilderAiPanelChat";

/**
 * Slice 4.AI-CONFIG-ASSIST-3 — render the chat-fill bubble (proposal / summary /
 * blocked). Pure presentational. Labels only — never the raw node id or field
 * key. There is deliberately NO Apply / Save / Run control; a confirmed fill only
 * writes the pending config draft (handled by the caller), and the immutable
 * "Not saved yet" notice makes that unambiguous.
 */

const NOT_SAVED_NOTICE = "Not saved yet — review and click Save, or run Check workflow again.";

export function ChatFillBody({
  fill,
  resolved,
  onConfirm,
  onCancel,
}: {
  readonly fill: AssistantChatFillChatMessage["fill"];
  /** True once this proposal has been confirmed or cancelled (buttons disable). */
  readonly resolved: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  if (fill.phase === "blocked") {
    return (
      <p
        data-testid="builder-ai-chat-fill-blocked"
        role="status"
        className="text-xs"
        style={{ color: "var(--builder-warn)" }}
      >
        {fill.message}
      </p>
    );
  }

  if (fill.phase === "summary") {
    const { fieldLabel, nodeLabel, previousValue, newValue } = fill.proposal;
    return (
      <div data-testid="builder-ai-chat-fill-summary" className="flex flex-col gap-1">
        <p className="text-xs font-medium" style={{ color: "var(--builder-text)" }}>
          Filled “{fieldLabel}” on “{nodeLabel}”.
        </p>
        <p className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
          Previous: {previousValue.length > 0 ? `“${previousValue}”` : "(empty)"}
        </p>
        <p className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
          New: “{newValue}”
        </p>
        <p className="text-[10px]" style={{ color: "var(--builder-muted)" }}>
          {NOT_SAVED_NOTICE}
        </p>
      </div>
    );
  }

  // proposal
  const { fieldLabel, nodeLabel, newValue } = fill.proposal;
  return (
    <div data-testid="builder-ai-chat-fill-proposal" className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: "var(--builder-text)" }}>
        Put this in “{fieldLabel}” on “{nodeLabel}”?
      </p>
      <pre
        data-testid="builder-ai-chat-fill-value"
        className="whitespace-pre-wrap rounded-[5px] px-2 py-1.5 text-[11.5px]"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
          color: "var(--builder-text)",
          fontFamily: "inherit",
        }}
      >
        {newValue}
      </pre>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={resolved}
          data-testid="builder-ai-chat-fill-confirm"
          className="h-7 text-xs"
        >
          {resolved ? "Filled" : "Confirm"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={resolved}
          data-testid="builder-ai-chat-fill-cancel"
          className="h-7 text-xs"
        >
          Cancel
        </Button>
      </div>
      <p className="text-[10px]" style={{ color: "var(--builder-muted)" }}>
        This only fills the field — nothing is saved or run.
      </p>
    </div>
  );
}
