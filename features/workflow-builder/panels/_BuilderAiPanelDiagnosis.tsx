"use client";

import { Button } from "@/components/ui/button";
import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";
import {
  DiagnosisAttentionActions,
  DiagnosisFieldActions,
  DiagnosisSetupActions,
} from "./_BuilderAiPanelRepairGoTo";

/**
 * Slice 4.AI-REPAIR-3F — the repair PROPOSAL and validated PREVIEW bubbles were
 * extracted into their own focused leaf modules to keep each panel file under the
 * project's max-lines threshold. They are re-exported here so existing import sites
 * (`_BuilderAiPanelMessageList`, the AI-REPAIR test suites) keep importing
 * `RepairProposalBody` / `RepairPreviewBody` from `_BuilderAiPanelDiagnosis`
 * unchanged. No behavior change.
 */
export { RepairProposalBody } from "./_BuilderAiPanelRepairProposal";
export { RepairPreviewBody } from "./_BuilderAiPanelRepairPreview";

/**
 * Read-only "Check this workflow" result body (Slice 4.AI-DIAG-1b).
 *
 * Extracted into its own sibling (mirroring `_BuilderAiPanelPreview.tsx`) to keep
 * `_BuilderAiPanelChat.tsx` under the project's max-lines threshold. Pure
 * presentational — renders the server-rendered `summaryText` (which already lists
 * the findings) plus the `nextSteps` action list. Deterministic: no LLM, no I/O.
 * The DTO is already sanitized (codes / node ids / provider ids+public names /
 * missing-field names / public scope-gap names / stored humanized run
 * classification / safe text) — no raw config / tokens / integration rows. An
 * access wall (`NOT_FOUND` / `NO_ACCESS`) renders a single safe line and nothing
 * else.
 */
export function DiagnosisBody({
  diagnosis,
  canExplain = false,
  explaining = false,
  alreadyExplained = false,
  onExplain,
  canSuggestFix = false,
  suggesting = false,
  alreadySuggested = false,
  onSuggestFix,
  showFieldActions = false,
  onPreviewInvalidRef,
  onPreviewSelectedInvalidRef,
  onPreviewDanglingEdge,
  onPreviewSelfLoopEdge,
  onPreviewDuplicateEdge,
  previewing = false,
  alreadyPreviewedInvalidRef = false,
}: {
  readonly diagnosis: AgentWorkflowDiagnosis;
  /**
   * Slice 4.AI-DIAG-2b/2c — show the "Explain with AI" affordance. The list sets
   * this true only for the LATEST OK diagnosis that still has something useful to
   * explain (`canExplainDiagnosis`); an access wall or a fully clean/ready check
   * never sets it, so the button is naturally hidden there.
   */
  readonly canExplain?: boolean;
  /** An explanation round-trip is in flight (disables the button). */
  readonly explaining?: boolean;
  /** This diagnosis already has an explanation (disables + relabels — no repeat charge). */
  readonly alreadyExplained?: boolean;
  /** Explicit-click handler (never auto-called). */
  readonly onExplain?: () => void;
  /**
   * Slice 4.AI-REPAIR-1c — show the "Suggest a fix" affordance. SAME gate as
   * `canExplain` (latest OK diagnosis with real issues); hidden on clean/ready +
   * access walls.
   */
  readonly canSuggestFix?: boolean;
  /** A repair-proposal round-trip is in flight (disables the button). */
  readonly suggesting?: boolean;
  /** This diagnosis already has a repair proposal (disables + relabels — no repeat charge). */
  readonly alreadySuggested?: boolean;
  /** Explicit-click handler (never auto-called). */
  readonly onSuggestFix?: () => void;
  /**
   * Slice 4.AI-CONFIG-ASSIST CS-5/CS-8 + CHECK-ACTIONS-1 — render the actionable
   * live-action groups: "Needs your input" (one "Open <field> field" action per
   * missing required field, across all affected nodes) and "Needs setup"
   * (reconnect/setup guidance + an Apps link per setup/auth/connection problem). Set
   * true only for the LATEST diagnosis so a stale check never shows live actions. Each
   * group renders nothing when its finding class is absent. Neither group requires
   * Suggest or Preview.
   */
  readonly showFieldActions?: boolean;
  /**
   * Slice 4.AI-REPAIR-3K — explicit-click handler for the one-candidate invalid-
   * reference "Preview fix" action in the "Needs attention" group. Runs the
   * deterministic repair-preview round-trip (no LLM / no credits / no model telemetry);
   * the resulting preview card is where Apply lives. Forwarded to
   * `DiagnosisAttentionActions`; only wired for the LATEST diagnosis (`showFieldActions`).
   */
  readonly onPreviewInvalidRef?: () => void;
  /**
   * Slice 4.AI-REPAIR-3L — explicit-choice handler for the MULTIPLE-candidate invalid-
   * reference picker. Forwarded to `DiagnosisAttentionActions`; only wired for the LATEST
   * diagnosis. Runs the deterministic selected-replacement preview (no LLM/credits/telemetry).
   */
  readonly onPreviewSelectedInvalidRef?: (selection: import("@/lib/api/ai").SelectedRepair) => void;
  /**
   * Slice 4.AI-REPAIR-4A — explicit-click handler for the dangling/broken-edge "Preview
   * fix". Forwarded to `DiagnosisAttentionActions`; only wired for the LATEST diagnosis.
   * Runs the deterministic `removeEdge` preview (no LLM / no credits / no telemetry).
   */
  readonly onPreviewDanglingEdge?: () => void;
  /**
   * Slice 4.AI-REPAIR-COVERAGE-1 — explicit-click handler for the self-loop-edge
   * "Preview fix". Forwarded to `DiagnosisAttentionActions`; only wired for the LATEST
   * diagnosis. Runs the deterministic `removeEdge` preview (no LLM / no credits / no telemetry).
   */
  readonly onPreviewSelfLoopEdge?: () => void;
  /**
   * AI-REPAIR-COVERAGE-2 — explicit-click handler forwarded to the duplicate-edge card's
   * "Preview fix" in the diagnosis. Runs the deterministic `removeEdge` preview (no LLM /
   * no credits / no telemetry).
   */
  readonly onPreviewDuplicateEdge?: () => void;
  /** A preview round-trip is in flight (disables the Preview-fix button). */
  readonly previewing?: boolean;
  /** This diagnosis already triggered a preview (disables + relabels — no repeat). */
  readonly alreadyPreviewedInvalidRef?: boolean;
}) {
  if (diagnosis.access !== "OK") {
    const msg =
      diagnosis.access === "NOT_FOUND"
        ? "This workflow couldn’t be found."
        : "You don’t have access to check this workflow.";
    return (
      <div data-testid="builder-ai-diagnosis" className="flex flex-col gap-1">
        <p className="text-xs font-medium">Workflow check</p>
        <p
          role="status"
          data-testid="builder-ai-diagnosis-summary"
          className="text-xs"
          style={{ color: "var(--builder-muted)" }}
        >
          {msg}
        </p>
      </div>
    );
  }

  const steps = diagnosis.nextSteps ?? [];
  return (
    <div data-testid="builder-ai-diagnosis" className="flex flex-col gap-2">
      <p className="text-xs font-medium">
        Workflow check
        {diagnosis.overallReady ? " — ready to run" : ""}
      </p>
      <p
        data-testid="builder-ai-diagnosis-summary"
        className="whitespace-pre-wrap text-xs"
        style={{ color: "var(--builder-text)" }}
      >
        {diagnosis.summaryText}
      </p>
      {/* CHECK-ACTIONS-2 — the generic deterministic "Next steps" list duplicates the
          per-type action groups below (input / setup / attention), so it is suppressed
          for the LIVE grouped panel (`showFieldActions`, the latest diagnosis). It is
          still rendered for a HISTORICAL diagnosis (no live groups), and for the access
          walls handled above it never reaches here. The `summaryText` always carries the
          full descriptive finding list, so suppressing the list hides nothing. */}
      {!showFieldActions && steps.length > 0 && (
        <div
          data-testid="builder-ai-diagnosis-next-steps"
          className="flex flex-col gap-1"
        >
          <p
            className="text-[11px] font-medium"
            style={{ color: "var(--builder-muted)" }}
          >
            Next steps
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}
      {/* CS-5/CS-8 — PRIMARY actions for missing user-input fields: one "Open <field>
          field" per missing required field across all affected nodes, directly from
          the check result (no Suggest / Preview required). Renders nothing when there
          are no missing required fields. */}
      {showFieldActions && <DiagnosisFieldActions diagnosis={diagnosis} />}
      {/* CHECK-ACTIONS-1 — setup/auth/connection problems (Slack disconnected, token
          expired, reconnect/owner-reconnect needed, missing permissions) get a
          dedicated "Needs setup" group: friendly guidance + an Apps link when the user
          can act. Renders nothing when there are no connection findings. */}
      {showFieldActions && <DiagnosisSetupActions diagnosis={diagnosis} />}
      {/* CHECK-ACTIONS-2 — non-targetable manual-guidance issues (structural / failed
          last run) get their own "Needs attention" group: deterministic guidance, no
          button. Renders nothing when there are no graph/run findings. */}
      {showFieldActions && (
        <DiagnosisAttentionActions
          diagnosis={diagnosis}
          {...(onPreviewInvalidRef ? { onPreviewInvalidRef } : {})}
          {...(onPreviewSelectedInvalidRef ? { onPreviewSelectedInvalidRef } : {})}
          {...(onPreviewDanglingEdge ? { onPreviewDanglingEdge } : {})}
          {...(onPreviewSelfLoopEdge ? { onPreviewSelfLoopEdge } : {})}
          {...(onPreviewDuplicateEdge ? { onPreviewDuplicateEdge } : {})}
          previewing={previewing}
          alreadyPreviewedInvalidRef={alreadyPreviewedInvalidRef}
        />
      )}
      {/* CHECK-ACTIONS-2 — AI affordances are grouped + visually separated under
          "AI can help" so they read as OPTIONAL assistance, distinct from the
          deterministic (free) actions above. The inner blocks keep their original
          testids + disabled/charge logic unchanged. */}
      {(canExplain || canSuggestFix) && (
        <div
          data-testid="builder-ai-diagnosis-ai-help"
          className="mt-1 flex flex-col gap-2 border-t pt-2"
          style={{ borderColor: "var(--builder-border)" }}
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-[11px] font-medium" style={{ color: "var(--builder-text)" }}>
              AI can help
            </p>
            <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
              Optional — let AI explain this check or suggest a fix. It never changes or
              runs your workflow.
            </p>
          </div>
          {canExplain && (
            <div data-testid="builder-ai-diagnosis-explain" className="flex flex-col gap-1">
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onExplain}
                  disabled={explaining || alreadyExplained}
                  data-testid="builder-ai-explain-button"
                >
                  {explaining ? "Explaining…" : alreadyExplained ? "Explained" : "Explain with AI"}
                </Button>
              </div>
              <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
                AI explains this check in plainer language. It doesn&rsquo;t change or run your
                workflow.
              </p>
            </div>
          )}
          {canSuggestFix && (
            <div data-testid="builder-ai-diagnosis-suggest-fix" className="flex flex-col gap-1">
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onSuggestFix}
                  disabled={suggesting || alreadySuggested}
                  data-testid="builder-ai-suggest-fix-button"
                >
                  {suggesting ? "Suggesting…" : alreadySuggested ? "Suggested" : "Suggest a fix"}
                </Button>
              </div>
              <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
                AI suggests how to fix this. It doesn&rsquo;t change or run your workflow.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Slice 4.AI-DIAG-2b — renders the LLM explanation bubble: a plain-language
 * paragraph plus optional priorities / information-needed lists. Pure
 * presentational; shows ONLY the safe explanation fields (no model metadata, ids,
 * codes, or raw DTO), and states plainly that nothing was changed or run.
 */
export function DiagnosisExplanationBody({
  explanation,
  priorities,
  missingInfo,
}: {
  readonly explanation: string;
  readonly priorities?: readonly string[];
  readonly missingInfo?: readonly string[];
}) {
  return (
    <div data-testid="builder-ai-diagnosis-explanation" className="flex flex-col gap-2">
      <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
        AI explanation
      </p>
      <p
        data-testid="builder-ai-diagnosis-explanation-text"
        className="whitespace-pre-wrap text-xs"
        style={{ color: "var(--builder-text)" }}
      >
        {explanation}
      </p>
      {priorities && priorities.length > 0 && (
        <div data-testid="builder-ai-diagnosis-explanation-priorities" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
            Top priorities
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
            {priorities.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {missingInfo && missingInfo.length > 0 && (
        <div data-testid="builder-ai-diagnosis-explanation-missing" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
            Information needed
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
            {missingInfo.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[10px]" style={{ color: "var(--builder-muted)" }}>
        This is an explanation only — your workflow wasn&rsquo;t changed or run.
      </p>
    </div>
  );
}

/**
 * Slice 4.AI-DIAG-QA-3 — single-shot workflow diagnosis Q&A bubble. Renders the
 * user's question, the model's plain-language answer, optional safe pointer lines,
 * and an optional "needs your decision" note. Pure presentational — shows ONLY the
 * safe API response fields (`answer` / `pointers` / `needsUserDecision`) plus the
 * locally-kept question. NO raw ids / config / tokens / DTO, and deliberately NO
 * Apply / Preview control: a Q&A answer is plain guidance. If the answer text points
 * at an existing Preview fix, that stays prose — the deterministic check cards remain
 * the only place an actual fix button lives.
 */
export function DiagnosisQaBody({
  question,
  answer,
  pointers,
  needsUserDecision = false,
}: {
  readonly question: string;
  readonly answer: string;
  readonly pointers?: readonly string[];
  readonly needsUserDecision?: boolean;
}) {
  return (
    <div data-testid="builder-ai-diagnosis-qa" className="flex flex-col gap-2">
      <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
        AI answer
      </p>
      <p
        data-testid="builder-ai-diagnosis-qa-question"
        className="whitespace-pre-wrap text-[11px] italic"
        style={{ color: "var(--builder-muted)" }}
      >
        {question}
      </p>
      <p
        data-testid="builder-ai-diagnosis-qa-answer"
        className="whitespace-pre-wrap text-xs"
        style={{ color: "var(--builder-text)" }}
      >
        {answer}
      </p>
      {pointers && pointers.length > 0 && (
        <div data-testid="builder-ai-diagnosis-qa-pointers" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
            Where to look
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
            {pointers.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {needsUserDecision && (
        <p
          data-testid="builder-ai-diagnosis-qa-needs-decision"
          role="status"
          className="text-[11px]"
          style={{ color: "var(--builder-warn)" }}
        >
          This needs a decision only you can make — review the options above before
          changing anything.
        </p>
      )}
      <p className="text-[10px]" style={{ color: "var(--builder-muted)" }}>
        This is an answer only — your workflow wasn&rsquo;t changed or run.
      </p>
    </div>
  );
}
