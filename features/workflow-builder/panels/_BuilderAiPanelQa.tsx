"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DIAGNOSIS_QA_MAX_QUESTION_LENGTH } from "@/lib/api/ai";

/**
 * Slice 4.AI-DIAG-QA-3 — the Builder AI workflow-diagnosis Q&A input.
 *
 * A small, self-contained question box rendered next to the deterministic
 * "Check workflow" action (the diagnosis/explain area) in the composer footer.
 * EXPLICIT submit only — there is no auto-call. It owns its own question text
 * locally so the main plan/follow-up composer state stays untouched; the panel
 * passes a single `onAsk(question)` handler + the in-flight / panel-busy flags.
 *
 * Submit is disabled when the question is empty/whitespace, exceeds the backend
 * max length, the panel is busy (plan / apply / check / explain / suggest /
 * preview), or a Q&A round-trip is already in flight. Pure presentational: it
 * never calls the API itself, never mutates the graph, and produces no Apply /
 * Preview affordance. The answer renders as a session-local `diagnosis_qa` bubble.
 */
export function BuilderAiPanelQaInput({
  onAsk,
  asking,
  panelBusy,
}: {
  /** Explicit-click handler (never auto-called). Receives the trimmed question. */
  readonly onAsk: (question: string) => void;
  /** True while a Q&A round-trip is in flight (disables submit + relabels). */
  readonly asking: boolean;
  /**
   * True when any other panel op (plan / apply / check / explain / suggest /
   * preview) is running — existing busy guards require the Q&A submit to be
   * disabled while one is active.
   */
  readonly panelBusy: boolean;
}) {
  const [question, setQuestion] = useState("");
  const trimmed = question.trim();
  const tooLong = question.length > DIAGNOSIS_QA_MAX_QUESTION_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !asking && !panelBusy;

  function submit(): void {
    if (!canSubmit) return;
    onAsk(trimmed);
    setQuestion("");
  }

  return (
    <div
      data-testid="builder-ai-qa"
      className="flex flex-col gap-1 rounded-md p-1.5"
      style={{
        background: "var(--builder-panel-2)",
        border: "1px solid var(--builder-border)",
      }}
    >
      <div className="flex items-end gap-1.5">
        <Textarea
          aria-label="Ask a question about this workflow"
          data-testid="builder-ai-qa-input"
          placeholder="Ask why this workflow won’t run…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter inserts a newline. Skip while an IME
            // composition is active so CJK / diacritic entry isn't cut off.
            if (e.key !== "Enter" || e.shiftKey) return;
            if (e.nativeEvent.isComposing) return;
            e.preventDefault();
            submit();
          }}
          disabled={asking || panelBusy}
          maxLength={DIAGNOSIS_QA_MAX_QUESTION_LENGTH + 100}
          aria-invalid={tooLong || undefined}
          rows={2}
          className="resize-none border-0 bg-transparent text-[12px] leading-[1.4] shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={submit}
          disabled={!canSubmit}
          data-testid="builder-ai-qa-submit"
          className="h-6 shrink-0 px-2 text-[11px]"
        >
          {asking ? "Asking…" : "Ask"}
        </Button>
      </div>
      {tooLong && (
        <p
          data-testid="builder-ai-qa-too-long"
          className="builder-mono px-0.5 text-[10.5px]"
          style={{ color: "var(--builder-danger)" }}
        >
          {question.length}/{DIAGNOSIS_QA_MAX_QUESTION_LENGTH} — too long, please shorten
          your question.
        </p>
      )}
    </div>
  );
}
