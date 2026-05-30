"use client";

import { Button } from "@/components/ui/button";
import type { AiRequiredUserInput } from "@/lib/api/ai";
import {
  isRequiredInputControlRenderable,
  RequiredInputControl,
  requiredInputKey,
  type RequiredInputAnswer,
} from "../ai";

/**
 * Required-input controls block for the React Agent plan result (Slice
 * 4.AI-22, extended in 4.AI-35 / 4.AI-35E). Extracted from
 * `_BuilderAiPanelChat.tsx` to keep that file under the project max-lines
 * threshold.
 *
 * Splits entries three ways:
 *   - `select_integration` (connect a disconnected provider) → a NON-BLOCKING
 *     "connect before activating" note. Apply (= create the draft) is allowed;
 *     connection is an Activation concern.
 *   - draft-forming entries that map to a known field/control → an interactive
 *     `RequiredInputControl`. The control-vs-bullet decision is delegated to
 *     the shared, metadata-driven {@link isRequiredInputControlRenderable}
 *     (Slice 4.AI-35E) so the chat renders the same class of control the config
 *     panel would — no provider-specific branches here.
 *   - everything else (a non-field clarification that maps to no known
 *     field/control) → a bullet.
 */

/**
 * Whether an entry renders as an interactive control. Thin re-export of the
 * shared resolver so existing imports stay stable while the mapping lives in
 * one place ({@link isRequiredInputControlRenderable}).
 */
export function isControlRenderable(input: AiRequiredUserInput): boolean {
  return isRequiredInputControlRenderable(input);
}

export function RequiredInputControlsBlock({
  inputs,
  stagedAnswers,
  onStagedAnswerChange,
  onSubmitDetails,
  canSubmitDetails,
  submittingDetails,
}: {
  readonly inputs: readonly AiRequiredUserInput[];
  readonly stagedAnswers: ReadonlyMap<string, RequiredInputAnswer>;
  readonly onStagedAnswerChange: (
    key: string,
    answer: RequiredInputAnswer | undefined,
  ) => void;
  /**
   * Slice 4.REACT-AGENT-CHAT-QOL-1 — submit handler + state for the inline
   * "Send details" button rendered directly under the interactive controls,
   * so the user doesn't have to scroll to the bottom composer after filling
   * them. Identical to the composer's submit (`BuilderAiPanel.handleSubmit`),
   * so there is no duplicate submit path. Optional so non-panel / test
   * renders of this block without a handler omit the button entirely.
   * This block only mounts for the ACTIVE (latest, non-persisted) plan_result
   * — `PlanResultBody` collapses older turns to a summary — so the inline
   * button is never shown on historical / read-only required-input messages.
   */
  readonly onSubmitDetails?: () => void;
  readonly canSubmitDetails?: boolean;
  readonly submittingDetails?: boolean;
}) {
  const setupInputs = inputs.filter((i) => i.kind === "select_integration");
  const draftInputs = inputs.filter((i) => i.kind !== "select_integration");
  const controls = draftInputs.filter(isControlRenderable);
  const bulletInputs = draftInputs.filter((i) => !isControlRenderable(i));
  const hasDraftBlockers = draftInputs.length > 0;
  // Inline Send details only when there ARE interactive controls to fill AND
  // the panel wired a submit handler (bullet-only / setup-only blocks rely on
  // the bottom composer). Disabled until there's something to send / while busy.
  const showInlineSend = controls.length > 0 && onSubmitDetails !== undefined;

  return (
    <div
      className="flex flex-col gap-2 rounded border p-2 text-xs"
      data-testid="builder-ai-needs-input"
      style={{ borderColor: "var(--builder-border)" }}
    >
      {hasDraftBlockers && (
        <p className="font-medium" style={{ color: "var(--builder-text)" }}>
          More information is needed before this can be built:
        </p>
      )}
      {bulletInputs.length > 0 && (
        <ul className="list-disc pl-4" style={{ color: "var(--builder-muted)" }}>
          {bulletInputs.map((i, idx) => (
            <li key={`${i.label}-${idx}`}>{i.label}</li>
          ))}
        </ul>
      )}
      {controls.map((input) => {
        const key = requiredInputKey(input);
        return (
          <RequiredInputControl
            key={key}
            input={input}
            inputKey={key}
            answer={stagedAnswers.get(key)}
            onChange={(next) => onStagedAnswerChange(key, next)}
            stagedAnswers={stagedAnswers}
          />
        );
      })}
      {showInlineSend && (
        <div>
          <Button
            type="button"
            size="sm"
            onClick={onSubmitDetails}
            disabled={canSubmitDetails !== true}
            data-testid="builder-ai-send-details-inline"
            className="h-7 px-2.5 text-[12px]"
          >
            {submittingDetails === true ? "Sending…" : "Send details"}
          </Button>
        </div>
      )}
      {setupInputs.length > 0 && (
        <div
          data-testid="builder-ai-setup-needed"
          className="flex flex-col gap-1 rounded border border-dashed p-2"
          style={{ borderColor: "var(--builder-border)" }}
        >
          <p style={{ color: "var(--builder-warn)" }}>
            Connect these before activating — you can still apply the draft now:
          </p>
          <ul className="list-disc pl-4" style={{ color: "var(--builder-muted)" }}>
            {setupInputs.map((i, idx) => (
              <li key={`${i.label}-${idx}`}>{i.label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
