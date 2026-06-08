import type { TemplateVisibility } from "@/contracts/workflowTemplate";
import { Button } from "@/components/ui/button";
import { OfficialBadge, CreatorChip, VisibilityChip } from "./TemplateBadges";

/**
 * A single template card (CS-XT-7A) — used for both marketplace and "your templates" items.
 * Renders attribution (official badge / community creator / "You"), usage + fork counts, and
 * always-visible actions (Use, Fork, plus publish-toggle + Delete for templates the viewer
 * authored). No raw account/user ids are ever rendered — attribution is the safe display-name
 * snapshot or the official badge only.
 */

type Attribution =
  | { kind: "official" }
  | { kind: "creator"; name: string | null }
  | { kind: "mine" };

export interface TemplateCardProps {
  templateId: string;
  name: string;
  description: string | null;
  attribution: Attribution;
  usageCount: number;
  forkCount: number;
  /** Shown for the viewer's own templates. */
  visibility?: TemplateVisibility;
  busy: boolean;
  onUse: () => void;
  onFork: () => void;
  /** Present only for templates the viewer authored (creator-only management). */
  manage?: { visibility: TemplateVisibility; onTogglePublish: () => void; onDelete: () => void };
}

function IconBolt() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function IconFork() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="12" cy="18" r="3" />
      <path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9M12 15v0" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

export function TemplateCard(props: TemplateCardProps) {
  const { attribution, manage, visibility } = props;
  return (
    <div
      data-testid="template-card"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-sky-500/60"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-tight text-foreground">{props.name}</h3>
        {visibility && <VisibilityChip visibility={visibility} />}
      </div>

      {props.description && (
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{props.description}</p>
      )}

      <div className="flex min-h-[20px] items-center gap-2">
        {attribution.kind === "official" && <OfficialBadge />}
        {attribution.kind === "creator" && attribution.name && <CreatorChip displayName={attribution.name} />}
        {attribution.kind === "mine" && (
          <span className="text-xs font-medium text-muted-foreground">By you</span>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1" title="Times used">
          <IconDownload /> {props.usageCount}
        </span>
        <span className="inline-flex items-center gap-1" title="Times forked">
          <IconFork /> {props.forkCount}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" data-testid="template-use" disabled={props.busy} onClick={props.onUse} className="gap-1.5">
          <IconBolt /> Use
        </Button>
        <Button size="sm" variant="outline" data-testid="template-fork" disabled={props.busy} onClick={props.onFork} className="gap-1.5">
          <IconFork /> Fork
        </Button>
        {manage && (
          <>
            <Button
              size="sm"
              variant="outline"
              data-testid="template-toggle-publish"
              disabled={props.busy}
              onClick={manage.onTogglePublish}
            >
              {manage.visibility === "private" ? "Publish" : "Unpublish"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid="template-delete"
              disabled={props.busy}
              onClick={manage.onDelete}
              className="text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
