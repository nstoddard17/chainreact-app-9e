"use client";

import Link from "next/link";
import type { WorkflowNode } from "@/contracts/workflow";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import type { AgentReadinessVerdict } from "@/core/workflows/agentReadiness";
import {
  describeRemainingIssues,
  REVIEW_STATUS_LABEL,
  type AgentReviewStatus,
} from "@/core/workflows/agentReviewStatus";
import { resolveHelpLink } from "@/features/marketing/help/contextualHelp";
import { AgentReadinessSummary } from "../panels/AgentReadinessSummary";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";
import {
  collectBuilderValidationIssues,
  type BuilderValidationIssue,
} from "./collectBuilderValidationIssues";
import { validationIssueGuidance } from "./validationIssueGuidance";
import {
  categorizeValidationIssue,
  validationCategoryLabel,
  VALIDATION_CATEGORY_ORDER,
  type ValidationIssueCategory,
} from "./validationIssueCategory";

interface Props {
  /**
   * Optional callback fired after the slice has been told to open a
   * node. The parent (`WorkflowBuilder`) uses this to flip the right
   * drawer mode from `validation` to `inspector`. Optional because the
   * configSlice transition by itself triggers the drawer flip via the
   * existing transition-refs in `WorkflowBuilder` — this callback is
   * just a hook for tests / future composition.
   */
  onOpenNode?: (nodeId: string) => void;
  /**
   * Slice 4.BUILDER-TRIGGER-RECOVERY-1 — optional callback that opens the
   * trigger picker. When provided, the `no_trigger` issue row renders an
   * inline "Choose trigger" action button so the missing-trigger error is
   * directly actionable from the validation drawer (it carries no `nodeId`,
   * so it is otherwise non-clickable). WorkflowBuilder wires this to
   * `openTriggerPicker`.
   */
  onChooseTrigger?: () => void;
  /**
   * BUILDER-READINESS — required-field metadata per `provider:type`. Threaded so
   * the summary lists `missing_required_field` issues (e.g. "HTTP Request needs a
   * Method"), staying in sync with the header pill count. Optional (no map → no
   * required-field rows), preserving isolated-test behavior.
   */
  requiredFieldsByType?: import("./collectBuilderValidationIssues").RequiredFieldsByType;
  /**
   * BUILDER-ISSUES-RAIL-1 — the post-apply agent review, folded INTO this rail.
   *
   * The React agent used to raise its own floating "Blocked · N issues remaining" tray over the
   * canvas listing the same gaps this rail already listed. There is now one issues surface: when an
   * apply has just happened, the parent passes its confirmation line here and it renders above the
   * list. Absent → the rail is the plain always-available issues view.
   */
  reviewNotice?: string | null;
  /**
   * REACT-AGENT-READINESS-1 — the post-apply readiness verdict, previously shown inside the tray.
   * Rendered under the notice so "what is left before this can run?" stays answered in one place.
   */
  readiness?: AgentReadinessVerdict | null;
  /**
   * Node ids the agent added/edited in the current review session. Used ONLY to pick honest
   * explanation copy: a gap on an agent-added step can say the agent left it empty; a gap on a
   * hand-built or template step must not. See `validationIssueGuidance`.
   */
  agentNodeIds?: ReadonlySet<string>;
}

/**
 * Validation summary drawer body (Slice 4.BUILDER-VALIDATION-1).
 *
 * Renders the list of `collectBuilderValidationIssues` against the
 * current `useGraphSlice` pending state. Shows a "Ready" state when
 * there are no issues, or the issues grouped by user-meaningful category
 * ("Needs your input" / "Workflow setup" / "Check your data") when there
 * are (Slice 4.BUILDER-VALIDATION-CATEGORIES — presentational grouping
 * only; severity + blocking semantics are unchanged). Issue rows that
 * carry a `nodeId` are clickable and open
 * the inspector for that node via `configSlice.openNode` — the
 * existing transition-ref machinery in `WorkflowBuilder` then flips
 * the right drawer from `validation` to `inspector`.
 *
 * Boundary rules:
 *   - Provider-agnostic: no per-provider strings, no per-provider
 *     branches. Node labels come from the slice + helpers only.
 *   - Read-only with respect to the graph: clicking an issue dispatches
 *     `configSlice.openNode`, which is the same path the canvas click
 *     and the NodeList Configure button already use. It does NOT
 *     mutate graphSlice (no add / remove / config-change side effects).
 *   - No fetch. No backend call. No AI service call.
 */
export function ValidationSummary({
  onOpenNode,
  onChooseTrigger,
  requiredFieldsByType,
  reviewNotice,
  readiness,
  agentNodeIds,
}: Props) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const openNode = useConfigSlice((s) => s.openNode);
  const revealNode = useConfigSlice((s) => s.revealNode);

  const issues = collectBuilderValidationIssues({
    pendingNodes,
    pendingEdges,
    requiredFieldsByType,
  });

  // Group by user-meaningful category (Slice 4.BUILDER-VALIDATION-CATEGORIES).
  // Presentational only — severity/blocking semantics are unchanged; each row
  // keeps its error/warning styling. "Needs your input" leads so a user who just
  // created a workflow from a template sees the required setup fields first.
  const groups = VALIDATION_CATEGORY_ORDER.map((category) => ({
    category,
    issues: issues.filter((i) => categorizeValidationIssue(i.code) === category),
  })).filter((g) => g.issues.length > 0);

  // HELP-CENTER-CONTEXTUAL-1 — resolver-gated footer link (issues state only).
  const setupIssuesHelp = resolveHelpLink({
    type: "builder_concept",
    concept: "setup_issues",
  });

  // BUILDER-ISSUES-RAIL-1 — the status the tray used to show in its pill, derived from the SAME
  // severity the validator already assigns: an error blocks test/activation, a warning does not.
  // No second ruleset — `blocked` exactly means "at least one error remains".
  const blockingCount = issues.filter((i) => i.severity === "error").length;
  const status: AgentReviewStatus =
    issues.length === 0 ? "ready" : blockingCount > 0 ? "blocked" : "review";

  if (issues.length === 0) {
    return (
      <div
        data-testid="validation-summary"
        data-state="ready"
        className="flex flex-col items-start gap-2 p-3 text-[13px]"
      >
        {/* An apply that resolved everything still confirms itself here, so the rail is never a
            blank panel after the user acts on the last issue. */}
        <div className="flex items-center gap-2">
          <StatusPill status="ready" />
          <span className="text-[11.5px]" style={{ color: "var(--builder-text-2)" }}>
            {describeRemainingIssues(0)}
          </span>
        </div>
        {reviewNotice ? (
          <p data-testid="validation-summary-notice" className="text-[11.5px]" style={{ color: "var(--builder-text)" }}>
            {reviewNotice}
          </p>
        ) : null}
        <p className="text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
          No builder validation issues detected.
        </p>
      </div>
    );
  }

  function handleOpen(issue: BuilderValidationIssue): void {
    if (!issue.nodeId) return;
    const node = pendingNodes.find((n) => n.id === issue.nodeId);
    if (!node) return;
    // CHECKLIST-ITEM-10 — when the issue points at a specific field, open the
    // node AND highlight/scroll to that field (reuses the repair-loop reveal path,
    // configSlice.revealNode). Navigation only — never writes a value or saves.
    // Node-level issues without a field keep the plain open-inspector behavior.
    if (issue.fieldName) {
      revealNode({
        nodeId: issue.nodeId,
        initialValues: node.config,
        fieldKey: issue.fieldName,
      });
    } else {
      openNode({ nodeId: issue.nodeId, initialValues: node.config });
    }
    onOpenNode?.(issue.nodeId);
  }

  return (
    <div
      data-testid="validation-summary"
      data-state="has-issues"
      data-status={status}
      /* The drawer body supplies no padding, so the rail owns its own — the tray's px-3/py-2
         breathing room, which is part of why it read as a card rather than a flush list. */
      className="flex flex-col gap-2.5 p-3 text-sm"
    >
      {/* BUILDER-ISSUES-RAIL-1 — the header the floating tray used to carry: status pill + the
          remaining count, so the rail answers "can this run yet?" before any scrolling. */}
      <div className="flex items-center gap-2">
        <StatusPill status={status} />
        <span
          data-testid="validation-summary-remaining"
          className="text-[11.5px]"
          style={{ color: "var(--builder-text-2)" }}
        >
          {describeRemainingIssues(issues.length)}
        </span>
      </div>

      {reviewNotice ? (
        <p data-testid="validation-summary-notice" className="text-[11.5px]" style={{ color: "var(--builder-text)" }}>
          {reviewNotice}
        </p>
      ) : null}
      {readiness ? <AgentReadinessSummary verdict={readiness} compact /> : null}

      {groups.map((group) => (
        <IssueGroup
          key={group.category}
          category={group.category}
          issues={group.issues}
          pendingNodes={pendingNodes}
          onOpen={handleOpen}
          onChooseTrigger={onChooseTrigger}
          {...(agentNodeIds ? { agentNodeIds } : {})}
        />
      ))}
      {/* HELP-CENTER-CONTEXTUAL-1 — one footer link to the setup-issues Help
          Center article (central resolver; renders nothing without a valid
          article). Issues-state only — the ready state needs no troubleshooting
          help. Navigation only; per-issue Open/Choose actions stay primary. */}
      {setupIssuesHelp && (
        <Link
          href={setupIssuesHelp.href}
          data-testid="validation-summary-help-link"
          className="w-fit text-[11.5px] underline underline-offset-2 hover:no-underline"
          style={{ color: "var(--builder-muted)" }}
        >
          {setupIssuesHelp.label}
        </Link>
      )}
    </div>
  );
}

function IssueGroup({
  category,
  issues,
  pendingNodes,
  onOpen,
  onChooseTrigger,
  agentNodeIds,
}: {
  category: ValidationIssueCategory;
  issues: readonly BuilderValidationIssue[];
  pendingNodes: readonly WorkflowNode[];
  onOpen: (issue: BuilderValidationIssue) => void;
  onChooseTrigger?: () => void;
  agentNodeIds?: ReadonlySet<string>;
}) {
  const hasError = issues.some((i) => i.severity === "error");
  // BUILDER-ISSUES-RAIL-1 — the tray's "N to fix before active" counter, per group. Errors are
  // exactly the issues that gate a test run / activation, so the count needs no separate rule.
  const blocking = issues.filter((i) => i.severity === "error").length;
  // The tray's header shape: a MUTED label on the left and the amber blocking counter on the
  // right. The label carries no inline "· N" when that counter is present — showing the same
  // number twice on one line is what made the old heading noisy. A warning-only group has no
  // counter, so it keeps the inline count.
  const label = blocking > 0
    ? validationCategoryLabel(category)
    : `${validationCategoryLabel(category)} · ${issues.length}`;
  return (
    <section
      data-testid="validation-summary-group"
      data-category={category}
      data-severity={hasError ? "error" : "warning"}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide">
        {/* Muted, not severity-tinted: severity now reads from the status pill and the counter,
            so the heading can stay quiet and let the issue cards carry the weight. */}
        <h3 style={{ color: "var(--builder-muted)" }}>{label}</h3>
        {blocking > 0 ? (
          <span
            data-testid="validation-summary-blocking"
            style={{ color: "var(--builder-warning, #b45309)" }}
          >
            {blocking} to fix before active
          </span>
        ) : null}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {issues.map((issue) => (
          <li key={issue.id}>
            <IssueRow
              issue={issue}
              pendingNodes={pendingNodes}
              onOpen={onOpen}
              onChooseTrigger={onChooseTrigger}
              {...(agentNodeIds ? { agentNodeIds } : {})}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function IssueRow({
  issue,
  pendingNodes,
  onOpen,
  onChooseTrigger,
  agentNodeIds,
}: {
  issue: BuilderValidationIssue;
  pendingNodes: readonly WorkflowNode[];
  onOpen: (issue: BuilderValidationIssue) => void;
  onChooseTrigger?: () => void;
  agentNodeIds?: ReadonlySet<string>;
}) {
  const node = issue.nodeId
    ? pendingNodes.find((n) => n.id === issue.nodeId)
    : undefined;
  // Slice 4.BUILDER-NODE-IDENTITY-1 — friendly user-facing label (custom node
  // name → metadata-derived default → formatted type key), never the raw
  // provider:type key or node id.
  const nodeLabel = node ? getNodeDisplayName(node) : null;
  const guidance = validationIssueGuidance(issue, agentNodeIds ? { agentNodeIds } : undefined);

  // BUILDER-ISSUES-RAIL-1 — the tray's card surface EXACTLY: panel background, neutral border, no
  // severity tint. Colouring the border red made a list of blocking issues read as a wall of
  // alarm; severity is already carried by the status pill and the "to fix before active" counter,
  // and the row's job is to be readable while it carries three lines.
  const containerClass = "w-full rounded border px-2.5 py-1.5 text-left transition";
  const containerStyle = {
    background: "var(--builder-panel-2)",
    borderColor: "var(--builder-border)",
  };
  const body = (
    <IssueBody
      message={issue.message}
      explanation={guidance.explanation}
      nextStep={guidance.nextStep}
      {...(nodeLabel && !issue.message.includes(nodeLabel) ? { nodeLabel } : {})}
    />
  );

  if (issue.nodeId) {
    return (
      <button
        type="button"
        onClick={() => onOpen(issue)}
        data-testid="validation-summary-issue"
        data-code={issue.code}
        data-node-id={issue.nodeId}
        data-severity={issue.severity}
        className={`${containerClass} hover:brightness-95 dark:hover:brightness-110`}
        style={containerStyle}
      >
        {body}
      </button>
    );
  }

  // Slice 4.BUILDER-TRIGGER-RECOVERY-1 — the graph-level `no_trigger` issue
  // carries no nodeId so it can't open an inspector. When the parent supplies
  // `onChooseTrigger`, render an inline action button so the missing-trigger
  // error is directly fixable from the issues rail.
  const showChooseTrigger =
    issue.code === "no_trigger" && onChooseTrigger !== undefined;

  return (
    <div
      data-testid="validation-summary-issue"
      data-code={issue.code}
      data-severity={issue.severity}
      className={containerClass}
      style={containerStyle}
    >
      <span className="flex items-start justify-between gap-2">
        {body}
        {showChooseTrigger ? (
          <button
            type="button"
            onClick={onChooseTrigger}
            data-testid="validation-choose-trigger"
            className="shrink-0 rounded border px-2 py-1 text-[11px] font-medium hover:brightness-95 dark:hover:brightness-110"
            style={{ borderColor: "var(--builder-border)", color: "var(--builder-accent)" }}
          >
            Choose trigger
          </button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The three-line issue body the agent tray used: WHAT is wrong, WHY, and the single next step.
 *
 * There is deliberately no fourth "node · field" locator line. The tray had none because its
 * message already names the step and its next step already names the field ("Send Channel Message
 * needs a Channel." / "Open the Channel field and fill it in."), so the locator was the same words
 * a third time. `nodeLabel` is passed ONLY for the issues whose message does not name the step
 * itself, so those stay attributable.
 */
function IssueBody({
  message,
  explanation,
  nextStep,
  nodeLabel,
}: {
  message: string;
  explanation: string;
  nextStep: string;
  nodeLabel?: string;
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
        {message}
      </span>
      <span
        data-testid="validation-summary-explanation"
        className="text-[11px]"
        style={{ color: "var(--builder-muted)" }}
      >
        {explanation}
      </span>
      <span
        data-testid="validation-summary-next-step"
        className="text-[11px] font-medium"
        style={{ color: "var(--builder-accent)" }}
      >
        {nextStep}
      </span>
      {nodeLabel ? (
        <span
          data-testid="validation-summary-locator"
          className="text-[11px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {nodeLabel}
        </span>
      ) : null}
    </span>
  );
}

function StatusPill({ status }: { status: AgentReviewStatus }) {
  const tone: Record<AgentReviewStatus, { bg: string; fg: string }> = {
    blocked: { bg: "var(--builder-danger-bg, rgba(185,28,28,0.12))", fg: "var(--builder-danger, #b91c1c)" },
    review: { bg: "var(--builder-warning-bg, rgba(180,83,9,0.12))", fg: "var(--builder-warning, #b45309)" },
    ready: { bg: "var(--builder-success-bg, rgba(21,128,61,0.12))", fg: "var(--builder-success, #15803d)" },
  };
  return (
    <span
      data-testid="validation-summary-status"
      data-status={status}
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: tone[status].bg, color: tone[status].fg }}
    >
      {REVIEW_STATUS_LABEL[status]}
    </span>
  );
}
