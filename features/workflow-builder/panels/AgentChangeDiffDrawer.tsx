"use client";

import type { AgentChangeHistoryItem } from "@/contracts/agentChangeHistory";
import type { ConfigDiff } from "@/core/workflows/buildConfigDiff";
import { BuilderRightDrawer } from "../layout/BuilderRightDrawer";
import type { SurfacePresentation } from "../layout/builderLayoutPolicy";
import { PreviewReviewPanel } from "./PreviewReviewPanel";

/**
 * AGENT-CHANGE-HISTORY-1 (View diff) — read-only right-drawer rendering of a PAST agent change's
 * stored, redacted diff. Reuses the live "Review changes" renderer (`PreviewReviewPanel`) in
 * `hideActions` mode — a past change can't be re-applied from here. Presentational only.
 *
 * The stored `diff` is the same secret-scrubbed `ConfigDiff` shape the live rail produces (the service
 * re-scrubs + size-caps before persisting), so the cast is shape-safe.
 */
export function AgentChangeDiffDrawer({
  item,
  onClose,
  presentation = "panel",
}: {
  readonly item: AgentChangeHistoryItem;
  readonly onClose: () => void;
  /** BUILDER-RESPONSIVE-LAYOUT-1 — passed straight through to the drawer shell. */
  readonly presentation?: SurfacePresentation;
}) {
  return (
    <BuilderRightDrawer
      title="Change details"
      onClose={onClose}
      presentation={presentation}
    >
      <PreviewReviewPanel
        hideActions
        {...(item.summary ? { summary: item.summary } : {})}
        configDiff={(item.diff as unknown as ConfigDiff | null) ?? null}
      />
    </BuilderRightDrawer>
  );
}
