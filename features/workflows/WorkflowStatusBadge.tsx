import { Badge } from "@/components/ui/badge";
import { displayStatus } from "@/core/workflows/projections";
import type { WorkflowSummary } from "@/contracts/workflow";
import { cn } from "@/lib/utils";

/**
 * Workflow status badge for the workflows dashboard
 * (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Renders the displayStatus label with a leading status icon so the state is
 * conveyed by **shape + text**, not color alone (a11y). Uses the app's HSL
 * Badge variants (success / warning / destructive / outline) — never the
 * builder's `--builder-*` tokens. Soft-deleted workflows aren't shown
 * (displayStatus returns null; the list API already filters them).
 */
interface Props {
  workflow: Pick<WorkflowSummary, "state" | "disabledReason">;
  className?: string;
}

export function WorkflowStatusBadge({ workflow, className }: Props) {
  const status = displayStatus(workflow);
  if (!status) return null;

  const variant =
    status.kind === "active"
      ? "success"
      : status.kind === "paused"
      ? "warning"
      : status.kind === "eligible_to_resume"
      ? "warning"
      : status.kind === "disabled"
      ? "destructive"
      : "outline";

  return (
    <Badge
      variant={variant}
      data-status-kind={status.kind}
      className={cn("max-w-full break-words", className)}
      aria-label={`Status: ${status.label}`}
    >
      <StatusIcon kind={status.kind} />
      <span>{status.label}</span>
    </Badge>
  );
}

function StatusIcon({ kind }: { kind: "draft" | "active" | "paused" | "disabled" | "eligible_to_resume" }) {
  const shared = {
    width: 10,
    height: 10,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "mr-1 shrink-0",
  };
  switch (kind) {
    case "active":
      // Filled circle (also reads as a "running" dot).
      return (
        <svg {...shared} fill="currentColor" stroke="none">
          <circle cx="8" cy="8" r="4" />
        </svg>
      );
    case "draft":
      // Pencil
      return (
        <svg {...shared}>
          <path d="M3 13l3-1 7-7-2-2-7 7-1 3z" />
        </svg>
      );
    case "paused":
      // Two vertical bars
      return (
        <svg {...shared}>
          <line x1="6" y1="3" x2="6" y2="13" />
          <line x1="10" y1="3" x2="10" y2="13" />
        </svg>
      );
    case "eligible_to_resume":
      // Refresh arrow
      return (
        <svg {...shared}>
          <path d="M13 8a5 5 0 1 1-1.46-3.54" />
          <polyline points="13 3 13 7 9 7" />
        </svg>
      );
    case "disabled":
      // Alert triangle
      return (
        <svg {...shared}>
          <path d="M8 2l6 11H2L8 2z" />
          <line x1="8" y1="6" x2="8" y2="9" />
          <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
        </svg>
      );
  }
}
