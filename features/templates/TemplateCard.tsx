import type { ReactNode } from "react";
import type { TemplateCardMeta, TemplateVisibility } from "@/contracts/workflowTemplate";
import {
  categoryLabel,
  providerLabel,
  stepLabel,
  TRIGGER_KIND_LABELS,
} from "@/core/workflows/templateCardMeta";
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
  /** DERIVED, credential-free browse metadata (marketplace cards). Optional — cards degrade
   *  gracefully without it (e.g. "Your templates" rows that don't carry it). */
  card?: TemplateCardMeta;
  busy: boolean;
  onUse: () => void;
  onFork: () => void;
  /** Opens the details / use-confirmation dialog before creating. When provided, the title
   *  becomes clickable and a "Details" action is shown (marketplace cards). */
  onDetails?: () => void;
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

/** Small neutral pill used for category / trigger-kind / provider chips. */
function MetaChip({ children, testid, title }: { children: ReactNode; testid?: string; title?: string }) {
  return (
    <span
      data-testid={testid}
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
    >
      {children}
    </span>
  );
}

/** Derived browse metadata: category + trigger kind, required apps, step count, and a static
 *  "Trigger → Action → Action" preview — all computed from the credential-free definition
 *  (no config, no ids, no provider calls). */
function CardMeta({ card }: { card: TemplateCardMeta }) {
  const preview = card.steps.map(stepLabel);
  return (
    <div className="flex flex-col gap-2" data-testid="template-card-meta">
      <div className="flex flex-wrap items-center gap-1.5">
        <MetaChip testid="template-category">{categoryLabel(card.category)}</MetaChip>
        <MetaChip testid="template-trigger-kind" title="How this template starts">
          {TRIGGER_KIND_LABELS[card.triggerKind]}
        </MetaChip>
        <MetaChip testid="template-step-count" title="Steps in this workflow">
          {card.stepCount} step{card.stepCount === 1 ? "" : "s"}
        </MetaChip>
      </div>

      {card.providers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="template-providers">
          {card.providers.map((p) => (
            <MetaChip key={p} testid={`template-provider-${p}`}>
              {providerLabel(p)}
            </MetaChip>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <p
          data-testid="template-preview"
          className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground"
          title={preview.join(" → ")}
        >
          {preview.map((label, i) => (
            <span key={i}>
              {i > 0 && <span aria-hidden className="px-1 text-sky-500">→</span>}
              {label}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export function TemplateCard(props: TemplateCardProps) {
  const { attribution, manage, visibility, card, onDetails } = props;
  return (
    <div
      data-testid="template-card"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-sky-500/60"
    >
      <div className="flex items-start justify-between gap-2">
        {onDetails ? (
          <button
            type="button"
            data-testid="template-title"
            onClick={onDetails}
            className="text-left text-base font-semibold leading-tight text-foreground hover:text-sky-700 hover:underline dark:hover:text-sky-300"
          >
            {props.name}
          </button>
        ) : (
          <h3 className="text-base font-semibold leading-tight text-foreground">{props.name}</h3>
        )}
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

      {card && <CardMeta card={card} />}

      <div className="flex items-center gap-4 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1" title="Times used">
          <IconDownload /> {props.usageCount}
        </span>
        <span className="inline-flex items-center gap-1" title="Times copied">
          <IconFork /> {props.forkCount}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {onDetails && (
          <Button size="sm" variant="outline" data-testid="template-details" disabled={props.busy} onClick={onDetails}>
            Details
          </Button>
        )}
        <Button size="sm" data-testid="template-use" disabled={props.busy} onClick={props.onUse} className="gap-1.5">
          <IconBolt /> Use
        </Button>
        {/* "Save a copy" (not "Fork" — dev jargon): creates the user's own editable copy. */}
        <Button size="sm" variant="outline" data-testid="template-fork" disabled={props.busy} onClick={props.onFork} className="gap-1.5">
          <IconFork /> Save a copy
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
