"use client";

import type { RepairProposal } from "@/lib/api/ai";
import { RepairProposalActions } from "./_BuilderAiPanelRepairGoTo";

/**
 * Slice 4.AI-REPAIR-1c — immutable, UI-OWNED "nothing changed" notice for a
 * repair proposal. Rendered as a literal constant (NOT `proposal.notAppliedNotice`
 * from the server) so the safety guarantee lives in the client and can never be
 * altered by a model/route response.
 */
const REPAIR_NOT_APPLIED_NOTICE_UI =
  "This is a suggestion only — your workflow wasn't changed, saved, or run.";

/**
 * Slice 4.AI-REPAIR-1c — renders the LLM REPAIR PROPOSAL bubble: a plain-language
 * summary, recommended actions, affected steps (safe labels), missing info, the
 * model's ADVISORY risk estimate, and a `requiresUserAction` hint. Pure
 * presentational; shows ONLY the safe proposal fields (no patch, no ids, no model
 * metadata). The "nothing was changed" notice is a UI-OWNED constant
 * (`REPAIR_NOT_APPLIED_NOTICE_UI`), never the server's `proposal.notAppliedNotice`,
 * and there is deliberately NO Apply control (executable repair is a later slice).
 *
 * Extracted from `_BuilderAiPanelDiagnosis.tsx` (Slice 4.AI-REPAIR-3F) to keep each
 * panel module under the project's max-lines threshold. Behavior, copy, and testIds
 * are unchanged.
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
