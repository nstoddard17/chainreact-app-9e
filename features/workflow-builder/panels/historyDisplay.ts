import type { AgentChangeHistoryItem } from "@/contracts/agentChangeHistory";

/**
 * AGENT-CHANGE-HISTORY-1 — shared display helpers for the History timeline.
 *
 * Pure formatting only (status label/color, value-free counts line, relative
 * time). No React, no I/O. Used by the History tab.
 */

export interface AgentChangeStatusDisplay {
  readonly label: string;
  /** CSS var (theme-aware) for the badge accent; falls back to a literal color. */
  readonly color: string;
}

// Keyed by status STRING (not the union) so a new status added elsewhere never
// breaks this map — `statusDisplay` falls back to a humanized label for any
// status without an explicit entry.
const STATUS_DISPLAY: Readonly<Record<string, AgentChangeStatusDisplay>> = {
  preview_created: { label: "Preview created", color: "var(--builder-muted)" },
  preview_applied: { label: "Applied", color: "var(--builder-accent, #0284c7)" },
  preview_discarded: { label: "Discarded", color: "var(--builder-muted)" },
  apply_failed: { label: "Failed", color: "var(--builder-danger, #dc2626)" },
  undone: { label: "Undone", color: "var(--builder-muted)" },
  tested: { label: "Tested", color: "var(--builder-success, #16a34a)" },
  test_failed: { label: "Test failed", color: "var(--builder-danger, #dc2626)" },
  restored_checkpoint: { label: "Restored checkpoint", color: "var(--builder-accent, #0284c7)" },
  kept_as_preview: { label: "Kept as preview", color: "var(--builder-muted)" },
};

/** Capitalized, space-separated fallback label for an unmapped status (e.g. "some_new" → "Some new"). */
function humanizeStatus(status: string): string {
  const spaced = status.replace(/_/g, " ").trim();
  return spaced.length === 0 ? status : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The badge label + color for a status; tolerant of statuses without an explicit entry. */
export function statusDisplay(status: string): AgentChangeStatusDisplay {
  return STATUS_DISPLAY[status] ?? { label: humanizeStatus(status), color: "var(--builder-muted)" };
}

export function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/** Build a compact "1 added · 1 removed · 1 setup issue" line; empty when nothing notable. */
export function countsLine(item: AgentChangeHistoryItem): string {
  const parts: string[] = [];
  if (item.addedNodeCount > 0) parts.push(`${item.addedNodeCount} added`);
  if (item.removedNodeCount > 0) parts.push(`${item.removedNodeCount} removed`);
  if (item.changedNodeCount > 0) parts.push(`${item.changedNodeCount} changed`);
  if (item.changedConfigCount > 0) {
    parts.push(`${item.changedConfigCount} field${item.changedConfigCount === 1 ? "" : "s"}`);
  }
  if (item.setupIssueCount > 0) {
    parts.push(`${item.setupIssueCount} setup issue${item.setupIssueCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
