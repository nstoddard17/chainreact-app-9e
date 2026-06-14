"use client";

import { Button } from "@/components/ui/button";
import type { AgentWorkflowDiagnosis, RepairPreview, RepairProposal } from "@/lib/api/ai";
import {
  DiagnosisFieldActions,
  RepairPreviewGoToTarget,
  RepairProposalActions,
} from "./_BuilderAiPanelRepairGoTo";

/**
 * Slice 4.AI-REPAIR-1c — immutable, UI-OWNED "nothing changed" notice for a
 * repair proposal. Rendered as a literal constant (NOT `proposal.notAppliedNotice`
 * from the server) so the safety guarantee lives in the client and can never be
 * altered by a model/route response.
 */
const REPAIR_NOT_APPLIED_NOTICE_UI =
  "This is a suggestion only — your workflow wasn't changed, saved, or run.";

/**
 * Slice 4.AI-REPAIR-2c — immutable, UI-OWNED "nothing changed" notice for a
 * validated patch PREVIEW. UI constant (never the server's `notAppliedNotice`) so
 * the safety guarantee can't be altered by a model/route response.
 */
const REPAIR_PREVIEW_NOT_APPLIED_NOTICE_UI =
  "This is a preview only — your workflow wasn't changed, saved, or run.";

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
   * Slice 4.AI-CONFIG-ASSIST CS-5/CS-8 — render the actionable "Needs your input"
   * group (one "Open <field> field" action per missing required field, across all
   * affected nodes). Set true only for the LATEST diagnosis so a stale check never
   * shows live actions. The group itself renders nothing when there are no missing
   * required fields. A missing-input issue needs neither Suggest nor Preview.
   */
  readonly showFieldActions?: boolean;
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
      {/* CS-5/CS-8 — PRIMARY actions for missing user-input fields: one "Open <field>
          field" per missing required field across all affected nodes, directly from
          the check result (no Suggest / Preview required). Renders nothing when there
          are no missing required fields. */}
      {showFieldActions && <DiagnosisFieldActions diagnosis={diagnosis} />}
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
  canPreview = false,
  previewing = false,
  alreadyPreviewed = false,
  onPreviewFix,
  goToNodeId = null,
}: {
  readonly proposal: RepairProposal;
  /**
   * Slice 4.AI-REPAIR-2c — show the "Preview fix" affordance. The list sets this
   * true only for the LATEST repair proposal (so a stale historical proposal never
   * offers a paid button). Hidden otherwise.
   */
  readonly canPreview?: boolean;
  /** A validated-preview round-trip is in flight (disables the button). */
  readonly previewing?: boolean;
  /** This proposal already has a preview (disables + relabels — no repeat charge). */
  readonly alreadyPreviewed?: boolean;
  /** Explicit-click handler (never auto-called). */
  readonly onPreviewFix?: () => void;
  /**
   * Slice 4.AI-CONFIG-ASSIST CS-4 — internal node id of the diagnosed missing
   * required field, when the issue is a single user-input-required field. The
   * actions area resolves its field client-side and offers a direct "Open <field>
   * field" affordance so Preview isn't a required step. Null → Preview-fix-only.
   */
  readonly goToNodeId?: string | null;
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
      <RepairProposalActions
        goToNodeId={goToNodeId}
        canPreview={canPreview}
        previewing={previewing}
        alreadyPreviewed={alreadyPreviewed}
        {...(onPreviewFix ? { onPreviewFix } : {})}
      />
    </div>
  );
}

/**
 * Slice 4.AI-REPAIR-2c — renders the VALIDATED PATCH PREVIEW bubble: a plain-language
 * summary, the label-based change list, the DETERMINISTIC (validator-recomputed)
 * risk, an optional candidate/cost summary, and — when the patch failed validation
 * — a friendly blocked reason + humanized validation messages. Pure presentational;
 * shows ONLY the safe, client-owned `RepairPreview` (no raw node ids, no raw JSON,
 * no model metadata). There is deliberately NO Apply control.
 */
export function RepairPreviewBody({
  preview,
}: {
  readonly preview: RepairPreview;
}) {
  const blocked = !preview.ok;
  return (
    <div data-testid="builder-ai-repair-preview" className="flex flex-col gap-2">
      <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
        Proposed changes (preview)
      </p>
      <p
        data-testid="builder-ai-repair-preview-summary"
        className="whitespace-pre-wrap text-xs"
        style={{ color: "var(--builder-text)" }}
      >
        {preview.userFacingSummaryText || preview.patchSummary}
      </p>

      {!blocked && preview.changes.length > 0 && (
        <div data-testid="builder-ai-repair-preview-changes" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
            What would change
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
            {preview.changes.map((c, i) => (
              <li key={i}>{c.description}</li>
            ))}
          </ul>
        </div>
      )}

      {!blocked && (
        <p
          data-testid="builder-ai-repair-preview-risk"
          className="text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          Validated risk: <span className="font-medium">{preview.riskLevel}</span>
          {preview.requiresConfirmation ? " · would require confirmation" : ""}
          {preview.taskCostEstimate
            ? ` · ~${preview.taskCostEstimate.estimatedTasksPerRun} task(s)/run`
            : ""}
        </p>
      )}

      {!blocked && preview.candidateSummary && (
        <p
          data-testid="builder-ai-repair-preview-candidate"
          className="text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          After: {preview.candidateSummary}
        </p>
      )}

      {!blocked && preview.validation.warnings.length > 0 && (
        <div data-testid="builder-ai-repair-preview-warnings" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-warn)" }}>
            Heads up
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs" style={{ color: "var(--builder-warn)" }}>
            {preview.validation.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {blocked && (
        <div data-testid="builder-ai-repair-preview-blocked" className="flex flex-col gap-1">
          <p role="status" className="text-xs" style={{ color: "var(--builder-warn)" }}>
            {preview.blockedReason
              ? `This fix can’t be applied as-is: ${preview.blockedReason}`
              : "This fix can’t be applied as-is."}
          </p>
          {preview.validation.errors.length > 0 && (
            <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs" style={{ color: "var(--builder-warn)" }}>
              {preview.validation.errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          )}
          <RepairPreviewGoToTarget preview={preview} />
        </div>
      )}

      <p
        data-testid="builder-ai-repair-preview-not-applied"
        className="text-[10px]"
        style={{ color: "var(--builder-muted)" }}
      >
        {REPAIR_PREVIEW_NOT_APPLIED_NOTICE_UI}
      </p>
    </div>
  );
}
