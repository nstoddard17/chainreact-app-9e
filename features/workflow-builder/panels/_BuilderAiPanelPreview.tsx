"use client";

import { AI_CREDITS_EXHAUSTED_MESSAGE, type AiPlanFailure, type AiPreview } from "@/lib/api/ai";

/**
 * Plan-result subcomponents for the BuilderAiPanel
 * (4.BUILDER-DESIGN-PARITY-1).
 *
 * Extracted out of `BuilderAiPanel.tsx` so the main panel stays under
 * the 500-line target. The components below — `PlanFailure`,
 * `PreviewSection`, `OpChip` — render the value-free AI-11 / AI-11B
 * surfaces in the Anthropic ChainV2 plan-card aesthetic. They preserve
 * every `data-testid` the existing `BuilderAiPanel.test.tsx` suite
 * asserts on (`builder-ai-plan-failure`, `builder-ai-plan-failure-detail`,
 * `builder-ai-preview`, `builder-ai-changes`, `builder-ai-risk-reasons`,
 * `builder-ai-validation-errors`, `builder-ai-validation-warnings`)
 * along with the exact text-content contracts those tests pattern-match
 * (model-unavailable copy, "wrong format", "text instead of the
 * required JSON", "Problems to fix:", "Warnings:" etc.).
 */

export function PlanFailure({ failure }: { failure: AiPlanFailure }) {
  // Slice 4.AI-CREDITS-3b-ii — an AI-credit exhaustion denial is a clean product
  // message, not a planner diagnostic. Render the shared safe copy and SUPPRESS the
  // technical "Planner error: stage / code" line (no billing internals surfaced).
  const isCreditDenial = failure.code === "AI_CREDITS_EXHAUSTED";
  const message = isCreditDenial
    ? AI_CREDITS_EXHAUSTED_MESSAGE
    : failure.code === "MODEL_FAILED"
      ? "The AI assistant isn’t available right now. An administrator may still need to finish setting it up — please try again later."
      : failure.code === "PARSE_FAILED"
        ? failure.errors?.[0]?.code === "NOT_JSON"
          ? "The AI returned text instead of the required JSON plan. Please try again."
          : "The AI returned a plan in the wrong format. Please try again, or add more detail about the apps and steps you want."
        : "Couldn’t preview a plan against this workflow. Please try again.";
  // Value-free diagnostic only (stage + code) — never the raw model
  // output or the detailed parser message, which could echo
  // model-supplied text. Omitted entirely for a credit denial.
  const detail = isCreditDenial ? undefined : failure.errors?.[0];
  return (
    <div
      role="status"
      data-testid="builder-ai-plan-failure"
      className="rounded-md p-2 text-[12px]"
      style={{
        background: "var(--builder-warn-soft)",
        border: "1px solid var(--builder-warn)",
        color: "var(--builder-warn)",
      }}
    >
      <p>{message}</p>
      {detail && (
        <p
          data-testid="builder-ai-plan-failure-detail"
          className="builder-mono mt-1 text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          Planner error: {detail.stage} / {detail.code}
        </p>
      )}
    </div>
  );
}

export function PreviewSection({ preview }: { preview: AiPreview }) {
  const nodeCount = preview.affectedNodeIds?.length ?? 0;
  const edgeCount = preview.affectedEdgeIds?.length ?? 0;
  const errors = preview.validation?.errors ?? [];
  const warnings = preview.validation?.warnings ?? [];
  const riskTone =
    preview.riskLevel === "high"
      ? "var(--builder-danger)"
      : preview.riskLevel === "medium"
        ? "var(--builder-warn)"
        : "var(--builder-success)";
  const riskBg =
    preview.riskLevel === "high"
      ? "var(--builder-danger-soft)"
      : preview.riskLevel === "medium"
        ? "var(--builder-warn-soft)"
        : "var(--builder-success-soft)";
  return (
    <div
      data-testid="builder-ai-preview"
      className="flex flex-col gap-2 rounded-md p-2.5"
      style={{
        border:
          "1px solid color-mix(in oklab, var(--builder-accent) 35%, var(--builder-border))",
        background:
          "color-mix(in oklab, var(--builder-accent) 4%, var(--builder-panel))",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="builder-mono text-[10.5px] font-semibold uppercase tracking-[0.04em]"
          style={{ color: "var(--builder-accent)" }}
          data-testid="builder-ai-preview-header"
        >
          Preview only · not applied yet
        </span>
        <span
          className="builder-mono inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-[10px]"
          style={{
            background: riskBg,
            color: riskTone,
            border: `1px solid ${riskTone}`,
          }}
        >
          {preview.riskLevel}-risk
        </span>
      </div>
      {/*
        AI-22 follow-up — explicit preview disclaimer. The chat-rendered
        preview can visually resemble the canvas at a glance (it lists the
        same node + edge counts and "Adds 'X'" change descriptions). This
        one-liner makes the read-only nature unambiguous so the user
        doesn't mistake a plan for an applied change.
      */}
      <p
        className="text-[11px]"
        style={{ color: "var(--builder-muted)" }}
        data-testid="builder-ai-preview-disclaimer"
      >
        Nothing is saved to your workflow until you click{" "}
        <span className="font-semibold" style={{ color: "var(--builder-text)" }}>
          Apply change
        </span>
        .
      </p>

      {(nodeCount > 0 || edgeCount > 0 || preview.taskCostEstimate) && (
        <div
          className="builder-mono flex flex-wrap items-center gap-3 rounded-[5px] px-2 py-1.5 text-[10.5px]"
          style={{
            background: "var(--builder-panel)",
            border: "1px solid var(--builder-border)",
          }}
        >
          {nodeCount > 0 && <StatPair label="nodes" value={`+${nodeCount}`} />}
          {edgeCount > 0 && <StatPair label="edges" value={`+${edgeCount}`} />}
          {preview.taskCostEstimate && (
            <StatPair
              label="cost"
              value={`~${preview.taskCostEstimate.estimatedTasksPerRun} tasks`}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <p
          className="text-[11px] font-semibold"
          style={{ color: "var(--builder-text)" }}
        >
          What AI plans to change
        </p>
        {preview.changes && preview.changes.length > 0 ? (
          <ul
            data-testid="builder-ai-changes"
            className="flex flex-col gap-1 text-[12px]"
            style={{ color: "var(--builder-text-2)" }}
          >
            {preview.changes.map((c, i) => (
              <li key={`${c.op}-${i}`} className="flex items-start gap-2">
                <OpChip op={c.op} />
                <span className="flex-1">{c.description}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            No structural changes detected.
          </p>
        )}
      </div>

      {preview.riskReasons && preview.riskReasons.length > 0 && (
        <ListBlock
          testId="builder-ai-risk-reasons"
          title={`Why this is ${preview.riskLevel}-risk`}
          items={preview.riskReasons.map((r) => ({
            key: r.code,
            text: r.message,
          }))}
          tone="muted"
        />
      )}

      {errors.length > 0 && (
        <ListBlock
          testId="builder-ai-validation-errors"
          title="Problems to fix:"
          items={errors.map((e) => ({ key: e.code, text: e.message }))}
          tone="danger"
        />
      )}

      {warnings.length > 0 && (
        <ListBlock
          testId="builder-ai-validation-warnings"
          title="Warnings:"
          items={warnings.map((w) => ({ key: w.code, text: w.message }))}
          tone="muted"
        />
      )}
    </div>
  );
}

function StatPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="uppercase tracking-[0.05em]"
        style={{ color: "var(--builder-muted)" }}
      >
        {label}
      </span>
      <code style={{ color: "var(--builder-text)" }}>{value}</code>
    </div>
  );
}

function ListBlock({
  testId,
  title,
  items,
  tone,
}: {
  testId: string;
  title: string;
  items: ReadonlyArray<{ key: string; text: string }>;
  tone: "danger" | "muted";
}) {
  const titleColor =
    tone === "danger" ? "var(--builder-danger)" : "var(--builder-text)";
  const itemColor =
    tone === "danger" ? "var(--builder-danger)" : "var(--builder-muted)";
  return (
    <div data-testid={testId} className="flex flex-col gap-1">
      <p
        className="text-[11px] font-semibold"
        style={{ color: titleColor }}
      >
        {title}
      </p>
      <ul
        className="flex list-disc flex-col gap-0.5 pl-4 text-[11.5px]"
        style={{ color: itemColor }}
      >
        {items.map((item, i) => (
          <li key={`${item.key}-${i}`}>{item.text}</li>
        ))}
      </ul>
    </div>
  );
}

function OpChip({ op }: { op: string }) {
  const tone =
    op === "add"
      ? { bg: "var(--builder-success-soft)", fg: "var(--builder-success)" }
      : op === "remove"
        ? { bg: "var(--builder-danger-soft)", fg: "var(--builder-danger)" }
        : { bg: "var(--builder-accent-soft)", fg: "var(--builder-accent)" };
  return (
    <span
      aria-hidden
      className="builder-mono inline-flex shrink-0 items-center rounded-[3px] px-1.5 text-[9.5px] font-semibold uppercase tracking-[0.05em]"
      style={{
        background: tone.bg,
        color: tone.fg,
        marginTop: 2,
        lineHeight: 1.4,
      }}
    >
      {op}
    </span>
  );
}
