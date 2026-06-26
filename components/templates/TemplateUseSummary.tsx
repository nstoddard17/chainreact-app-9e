import type { ReactNode } from "react";
import type { TemplateCardMeta } from "@/contracts/workflowTemplate";
import {
  categoryLabel,
  providerLabel,
  stepLabel,
  TRIGGER_KIND_LABELS,
} from "@/core/workflows/templateCardMeta";

/**
 * Reusable template "use summary" (CS-XT-MARKETPLACE-UX-DETAIL). One presentational block,
 * shared by the marketplace details dialog AND the in-builder create/replace confirmation, so a
 * user sees the SAME clear summary before any create/replace happens.
 *
 * Renders ONLY the safe, DERIVED {@link TemplateCardMeta} (category, trigger kind, required apps,
 * step count, and the static trigger → action chain) plus friendly "what happens next" copy. It
 * reads NO raw definition / config / ids and makes NO network or provider calls — everything comes
 * from the credential-free card metadata the server already derived.
 *
 * `variant` only changes the "what happens next" copy:
 *   - `use` / `create` — a NEW workflow is created from the template and opened.
 *   - `replace`        — the CURRENT workflow draft is replaced by the template. (Lifecycle /
 *                        unsaved-changes warnings stay with the host dialog; this block never
 *                        weakens them — it only adds the plain-English summary.)
 */

interface Props {
  description?: string | null;
  card?: TemplateCardMeta;
  variant: "use" | "create" | "replace";
}

function Chip({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <span
      data-testid={testid}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
    >
      {children}
    </span>
  );
}

/** Plain-English "what happens next" copy. The two reassurance notes are SHARED across variants
 *  (every path connects apps + fills fields after creation, and never copies credentials). */
function whatHappensNext(variant: Props["variant"]): { lead: string } {
  switch (variant) {
    case "replace":
      return { lead: "This will replace the current workflow draft with the selected template." };
    case "create":
      return { lead: "This creates a new workflow from this template and opens it in the builder." };
    case "use":
    default:
      return {
        lead: "When you click Use, ChainReact creates a new workflow from this template in your account and opens it in the builder.",
      };
  }
}

export function TemplateUseSummary({ description, card, variant }: Props) {
  const next = whatHappensNext(variant);
  const steps = card?.steps ?? [];

  return (
    <div className="flex flex-col gap-4" data-testid="template-use-summary">
      {description && (
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}

      {card && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip testid="summary-category">{categoryLabel(card.category)}</Chip>
            <Chip testid="summary-trigger-kind">{TRIGGER_KIND_LABELS[card.triggerKind]}</Chip>
            <Chip testid="summary-step-count">
              {card.stepCount} step{card.stepCount === 1 ? "" : "s"}
            </Chip>
          </div>

          {card.providers.length > 0 && (
            <div className="flex flex-col gap-1.5" data-testid="summary-required-apps">
              <span className="text-xs font-semibold text-foreground">Required apps</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {card.providers.map((p) => (
                  <Chip key={p} testid={`summary-provider-${p}`}>
                    {providerLabel(p)}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div className="flex flex-col gap-1.5" data-testid="summary-chain">
              <span className="text-xs font-semibold text-foreground">Workflow steps</span>
              <ol className="flex flex-col gap-1">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      aria-hidden
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                    >
                      {i + 1}
                    </span>
                    <span className="font-medium uppercase tracking-wide text-[9.5px] text-sky-600 dark:text-sky-400">
                      {s.kind}
                    </span>
                    <span className="text-foreground">{stepLabel(s)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      <div
        data-testid="summary-what-happens-next"
        className="flex flex-col gap-1.5 rounded-md border border-sky-300/60 bg-sky-50 px-3 py-2.5 text-xs text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
      >
        <span className="font-semibold">{next.lead}</span>
        <span>You&apos;ll connect apps and fill in required fields after the workflow is created.</span>
        <span>This template does not copy credentials or account-specific settings.</span>
      </div>
    </div>
  );
}
