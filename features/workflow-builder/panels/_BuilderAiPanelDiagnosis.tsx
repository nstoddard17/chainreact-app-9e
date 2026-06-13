"use client";

import { Button } from "@/components/ui/button";
import type { AgentWorkflowDiagnosis, RepairProposal } from "@/lib/api/ai";

/**
 * Slice 4.AI-REPAIR-1c — immutable, UI-OWNED "nothing changed" notice for a
 * repair proposal. Rendered as a literal constant (NOT `proposal.notAppliedNotice`
 * from the server) so the safety guarantee lives in the client and can never be
 * altered by a model/route response.
 */
const REPAIR_NOT_APPLIED_NOTICE_UI =
  "This is a suggestion only — your workflow wasn't changed, saved, or run.";

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
      {steps.length > 0 && (
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
      {canExplain && (
        <div data-testid="builder-ai-diagnosis-explain" className="flex flex-col gap-1 pt-1">
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
        <div data-testid="builder-ai-diagnosis-suggest-fix" className="flex flex-col gap-1 pt-1">
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
 * Slice 4.AI-REPAIR-1c — renders the LLM REPAIR PROPOSAL bubble: a plain-language
 * summary, recommended actions, affected steps (safe labels), missing info, the
 * model's ADVISORY risk estimate, and a `requiresUserAction` hint. Pure
 * presentational; shows ONLY the safe proposal fields (no patch, no ids, no model
 * metadata). The "nothing was changed" notice is a UI-OWNED constant
 * (`REPAIR_NOT_APPLIED_NOTICE_UI`), never the server's `proposal.notAppliedNotice`,
 * and there is deliberately NO Apply control (executable repair is a later slice).
 */
export function RepairProposalBody({
  proposal,
}: {
  readonly proposal: RepairProposal;
}) {
  return (
    <div data-testid="builder-ai-repair-proposal" className="flex flex-col gap-2">
      <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
        Suggested fix
      </p>
      <p
        data-testid="builder-ai-repair-summary"
        className="whitespace-pre-wrap text-xs"
        style={{ color: "var(--builder-text)" }}
      >
        {proposal.summary}
      </p>
      {proposal.recommendedActions.length > 0 && (
        <div data-testid="builder-ai-repair-actions" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
            Recommended changes
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
            {proposal.recommendedActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {proposal.affectedNodes.length > 0 && (
        <div data-testid="builder-ai-repair-affected" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
            Steps involved
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
            {proposal.affectedNodes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {proposal.missingInfo.length > 0 && (
        <div data-testid="builder-ai-repair-missing" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
            Information needed
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
            {proposal.missingInfo.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <p
        data-testid="builder-ai-repair-risk"
        className="text-[10.5px]"
        style={{ color: "var(--builder-muted)" }}
      >
        AI&rsquo;s risk estimate: <span className="font-medium">{proposal.riskLevel}</span>
        {proposal.requiresUserAction
          ? " · You'll need to take an action outside the builder (e.g. reconnect an account)."
          : ""}
      </p>
      <p
        data-testid="builder-ai-repair-not-applied"
        className="text-[10px]"
        style={{ color: "var(--builder-muted)" }}
      >
        {REPAIR_NOT_APPLIED_NOTICE_UI}
      </p>
    </div>
  );
}
