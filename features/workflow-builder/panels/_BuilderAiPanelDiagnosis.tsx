"use client";

import { Button } from "@/components/ui/button";
import type { AgentWorkflowDiagnosis, RepairPreview, RepairProposal } from "@/lib/api/ai";
import {
  DiagnosisAttentionActions,
  DiagnosisFieldActions,
  DiagnosisSetupActions,
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
   * Slice 4.AI-CONFIG-ASSIST CS-5/CS-8 + CHECK-ACTIONS-1 — render the actionable
   * live-action groups: "Needs your input" (one "Open <field> field" action per
   * missing required field, across all affected nodes) and "Needs setup"
   * (reconnect/setup guidance + an Apps link per setup/auth/connection problem). Set
   * true only for the LATEST diagnosis so a stale check never shows live actions. Each
   * group renders nothing when its finding class is absent. Neither group requires
   * Suggest or Preview.
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
      {showFieldActions && <DiagnosisAttentionActions diagnosis={diagnosis} />}
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
 * no model metadata).
 *
 * Slice 4.AI-REPAIR-3E — when `canApply` is true (the LATEST preview, server-marked
 * applyable, with the opaque operations + baseRevision), it renders the Apply button.
 * The raw operations are NEVER rendered — only the value-free `changes`. Apply is hidden
 * for a blocked / non-latest / metadata-less preview. On success it shows "Applied fix.
 * Workflow not run."; on stale/blocked/network failure it shows safe copy and removes
 * the button (the user re-runs Check / Preview).
 */
export function RepairPreviewBody({
  preview,
  canApply = false,
  applying = false,
  applied = false,
  applyError = null,
  onApply,
}: {
  readonly preview: RepairPreview;
  /** Show the Apply button — set true only for the LATEST applyable preview. */
  readonly canApply?: boolean;
  /** An apply round-trip is in flight (disables the button). */
  readonly applying?: boolean;
  /** This preview was applied (success line; no button). */
  readonly applied?: boolean;
  /** Safe stale/blocked/network copy for a failed apply (removes the button). */
  readonly applyError?: string | null;
  /** Explicit-click handler (never auto-called). */
  readonly onApply?: () => void;
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

      {/* AI-REPAIR-3E — Apply affordance for a VALIDATED, applyable preview only. The
          raw operations are forwarded by the parent, never rendered here. */}
      {applied ? (
        <p
          data-testid="builder-ai-repair-apply-success"
          role="status"
          className="text-xs text-emerald-700 dark:text-emerald-400"
        >
          ✓ Applied fix. Workflow not run.
        </p>
      ) : applyError ? (
        <p
          data-testid="builder-ai-repair-apply-error"
          role="status"
          className="text-xs"
          style={{ color: "var(--builder-warn)" }}
        >
          {applyError}
        </p>
      ) : canApply ? (
        <div data-testid="builder-ai-repair-apply" className="flex flex-col gap-1 pt-1">
          <div>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={onApply}
              disabled={applying}
              data-testid="builder-ai-repair-apply-button"
            >
              {applying ? "Applying…" : "Apply fix"}
            </Button>
          </div>
          <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
            Applies this validated change to your workflow. It won&rsquo;t run or activate the
            workflow.
          </p>
        </div>
      ) : null}

      {/* The "nothing changed yet" notice — hidden once applied (it would be misleading). */}
      {!applied && (
        <p
          data-testid="builder-ai-repair-preview-not-applied"
          className="text-[10px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {REPAIR_PREVIEW_NOT_APPLIED_NOTICE_UI}
        </p>
      )}
    </div>
  );
}
