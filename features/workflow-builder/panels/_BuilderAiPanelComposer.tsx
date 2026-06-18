"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BuilderAiPanelQaInput } from "./_BuilderAiPanelQa";

/**
 * Pinned-bottom composer for the React Agent chat (Slice 4.AI-21C).
 *
 * Extracted from `BuilderAiPanel.tsx` to keep the panel under the project's
 * max-lines warning threshold (and to give the composer a single home for
 * any future inline-field affordances — e.g. a Slack channel picker — that
 * would otherwise grow the panel further). Pure presentational: no hook
 * imports, no API client imports. The panel owns the `prompt` value + the
 * submit / clear handlers; the composer owns the textarea + button + kbd
 * hint + char-counter and self-derives `tooLong` / `canSubmit`.
 *
 * All testIds preserved verbatim from AI-21B for back-compat with the
 * existing BuilderAiPanel test suite.
 */

const MAX_PROMPT_LENGTH = 8_000;
const COUNTER_THRESHOLD = Math.floor(MAX_PROMPT_LENGTH * 0.8);

export const BUILDER_AI_MAX_PROMPT_LENGTH = MAX_PROMPT_LENGTH;

interface Props {
  readonly prompt: string;
  readonly onPromptChange: (next: string) => void;
  readonly onSubmit: () => void;
  readonly onClear: () => void;
  readonly followUpMode: boolean;
  readonly planning: boolean;
  readonly busy: boolean;
  readonly hasMessages: boolean;
  /**
   * Slice 4.AI-DIAG-1b — read-only "Check this workflow" action. `onCheckWorkflow`
   * runs the deterministic diagnosis; `checking` is true while it's in flight.
   * The button is disabled during ANY busy state (plan/apply) or an in-flight
   * check, and a check disables the composer so no conflicting op can start.
   */
  readonly onCheckWorkflow: () => void;
  readonly checking: boolean;
  /**
   * Slice 4.AI-DIAG-QA-3 — single-shot workflow Q&A. `onAskDiagnosisQuestion`
   * submits the typed question (explicit only — never auto-called); `asking` is true
   * while the round-trip is in flight; `qaPanelBusy` is true when any OTHER panel op
   * (plan / apply / check / explain / suggest / preview) is running, so the Q&A
   * submit obeys the existing busy guards. The Q&A input owns its own text state.
   */
  readonly onAskDiagnosisQuestion: (question: string) => void;
  readonly asking: boolean;
  readonly qaPanelBusy: boolean;
  /**
   * AI-22 — when true (any staged required-input answers exist), the
   * submit button is enabled even with an empty composer textarea. The
   * user can fill the controls and click Send details with no extra
   * typed text. Defaults to false so pre-AI-22 single-prompt flow is
   * unaffected.
   */
  readonly hasStagedAnswers?: boolean;
  /**
   * Slice 4.AI-CONFIG-ASSIST CS-6 — chat-fill discoverability. Set by the panel
   * ONLY when a chat-fill-ELIGIBLE field is currently highlighted (the 2F "Open
   * field" reveal). Drives a contextual helper hint above the input + a
   * field-specific placeholder so the user knows they can type the missing value
   * here. Labels only — never the raw field key / node id. Null/undefined → the
   * composer behaves exactly as before (no hint, default placeholder).
   */
  readonly chatFillHint?: { readonly fieldLabel: string; readonly nodeLabel: string } | null;
  /**
   * Slice 4.AI-CONFIG-ASSIST CS-7 — exit chat-fill targeting back to normal AI chat.
   * Invoked by the inline "Ask something else" action and by Escape while the
   * composer is focused (only when `chatFillHint` is active). Clears the highlighted-
   * field targeting WITHOUT closing the config panel, saving, running, or touching the
   * already-typed config value.
   */
  readonly onExitChatFill?: () => void;
}

export function BuilderAiPanelComposer({
  prompt,
  onPromptChange,
  onSubmit,
  onClear,
  followUpMode,
  planning,
  busy,
  hasMessages,
  hasStagedAnswers,
  onCheckWorkflow,
  checking,
  onAskDiagnosisQuestion,
  asking,
  qaPanelBusy,
  chatFillHint,
  onExitChatFill,
}: Props) {
  const trimmed = prompt.trim();
  const tooLong = prompt.length > MAX_PROMPT_LENGTH;
  const hasContent = trimmed.length > 0 || hasStagedAnswers === true;
  // A read-only check / in-flight Q&A also block submitting so the panel never runs
  // conflicting ops.
  const canSubmit = hasContent && !tooLong && !busy && !checking && !asking;
  const showCounter = prompt.length >= COUNTER_THRESHOLD || tooLong;

  return (
    <footer
      data-testid="builder-ai-composer"
      className="shrink-0 flex flex-col gap-1"
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCheckWorkflow}
          disabled={busy || checking || asking}
          data-testid="builder-ai-check-button"
          className="h-6 px-2 text-[11px]"
          title="Run a read-only check: is this workflow ready to run?"
        >
          {checking ? "Checking…" : "Check workflow"}
        </Button>
        {hasMessages && !busy && !checking && !asking ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onClear}
            data-testid="builder-ai-clear-button"
            className="h-6 px-2 text-[11px]"
          >
            Clear conversation
          </Button>
        ) : null}
      </div>

      {/* AI-DIAG-QA-3 — single-shot workflow Q&A, next to the deterministic
          "Check workflow" action. Explicit submit only; renders a session-local
          answer bubble; no Apply / Preview / mutation. */}
      <BuilderAiPanelQaInput
        onAsk={onAskDiagnosisQuestion}
        asking={asking}
        panelBusy={qaPanelBusy}
      />

      {chatFillHint && (
        <div className="flex items-start justify-between gap-2 px-1">
          <p
            data-testid="builder-ai-chatfill-hint"
            role="status"
            className="text-[11px] leading-relaxed"
            style={{ color: "var(--builder-muted)" }}
          >
            Type the missing &ldquo;{chatFillHint.fieldLabel}&rdquo; below. I&rsquo;ll ask
            before filling it, and you&rsquo;ll still save manually.
          </p>
          {/* CS-7 — obvious escape back to normal AI chat (also via Escape). */}
          <button
            type="button"
            onClick={onExitChatFill}
            data-testid="builder-ai-chatfill-exit"
            className="shrink-0 whitespace-nowrap text-[11px] underline-offset-2 hover:underline"
            style={{ color: "var(--builder-muted)" }}
          >
            Ask something else
          </button>
        </div>
      )}

      <div
        className="flex flex-col gap-0 rounded-md"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
        }}
      >
        <Textarea
          aria-label={
            chatFillHint
              ? `Type the ${chatFillHint.fieldLabel} value`
              : followUpMode
                ? "Reply with the missing details"
                : "Describe the workflow change"
          }
          data-testid="builder-ai-prompt"
          placeholder={
            chatFillHint
              ? `Type ${chatFillHint.fieldLabel} value…`
              : followUpMode
                ? "Reply with the missing details — e.g. ‘Use #general and say Test from ChainReact AI.’"
                : "Describe a change — e.g. ‘retry once on 5xx, then DM #oncall’"
          }
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            // Slice 4.AI-CONFIG-ASSIST CS-7 — Escape exits chat-fill targeting back
            // to normal AI chat. Only while the field-fill hint is active; otherwise
            // Escape keeps its default behavior. Clears targeting only — never closes
            // the config panel, saves, runs, or touches the typed config value.
            if (e.key === "Escape" && chatFillHint) {
              e.preventDefault();
              onExitChatFill?.();
              return;
            }
            // Slice 4.REACT-AGENT-CHAT-QOL-1 — Enter submits, Shift+Enter
            // inserts a newline. Skip while an IME composition is active so
            // CJK / diacritic entry isn't cut off (the composing Enter just
            // commits the candidate). `canSubmit` already gates out
            // whitespace-only / too-long / busy, so a blocked Enter is a
            // no-op rather than a double-submit.
            if (e.key !== "Enter" || e.shiftKey) return;
            if (e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (canSubmit) onSubmit();
          }}
          disabled={busy || checking || asking}
          maxLength={MAX_PROMPT_LENGTH + 100}
          aria-invalid={tooLong || undefined}
          rows={3}
          className="resize-none border-0 bg-transparent text-[12.5px] leading-[1.45] shadow-none focus-visible:ring-0"
        />
        <div
          className="flex items-center justify-between gap-2 px-2 pb-2 pt-1"
          style={{ borderTop: "0" }}
        >
          <span
            className="builder-mono text-[10.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            <kbd
              className="rounded-[3px] px-1.5 py-px text-[9.5px]"
              style={{
                background: "var(--builder-panel)",
                border: "1px solid var(--builder-border)",
                color: "var(--builder-muted)",
              }}
            >
              ↵
            </kbd>
            <span className="ml-1.5">{followUpMode ? "send" : "plan"}</span>
            <span className="ml-1.5 opacity-70">· ⇧↵ newline</span>
          </span>
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={!canSubmit}
            data-testid="builder-ai-plan-button"
            className="h-7 px-2.5 text-[12px]"
            style={{
              background: "var(--builder-text)",
              color: "var(--builder-panel)",
              border: "1px solid var(--builder-text)",
            }}
          >
            {planning ? "Thinking…" : followUpMode ? "Send details" : "Plan with AI"}
          </Button>
        </div>
      </div>

      {showCounter && (
        <p
          data-testid="builder-ai-char-count"
          className="builder-mono px-1 text-[11px]"
          style={{
            color: tooLong ? "var(--builder-danger)" : "var(--builder-muted)",
          }}
        >
          {prompt.length}/{MAX_PROMPT_LENGTH}
          {tooLong ? " — too long, please shorten your request." : ""}
        </p>
      )}
    </footer>
  );
}
