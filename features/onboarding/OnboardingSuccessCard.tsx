"use client";

import Link from "next/link";
import { MarketingBrandLogo } from "@/features/marketing/MarketingBrandLogo";
import { ObIcons } from "./onboardingIcons";

/**
 * Completion state (5.ONBOARD-1 Batch 2) — ports the design's `.ob-final`
 * (centered brand mark, title, sub-copy, action row) with the celebrate pulse
 * (`obPulse` → `.ob-animate-celebrate`, motion-safe only). Copy uses the
 * required success sentence and, per locked decision #7, names the ACTUAL
 * workflow that completed onboarding when it still exists.
 *
 * Shown only while the celebration is unacknowledged — silently-latched
 * accounts (pre-existing activations) never see it (celebrated_at was stamped
 * at latch time).
 */
export function OnboardingSuccessCard({
  completionWorkflow,
  onDone,
}: {
  /**
   * Live row → `{id, name}` (links to the workflow); deleted row with a
   * surviving snapshot → `{id: null, name}` (named, not linked); neither →
   * null (generic copy). See the DTO contract.
   */
  completionWorkflow: { id: string | null; name: string } | null;
  onDone: () => void;
}) {
  return (
    <section
      role="region"
      aria-label="Getting started — complete"
      data-testid="onboarding-success-card"
      className="ob-animate-card-in ob-animate-celebrate w-full max-w-sm overflow-hidden rounded-[18px] bg-gradient-to-b from-accent/70 to-card shadow-[inset_0_0_0_1px_hsl(var(--border))]"
    >
      <div className="px-6 pb-[26px] pt-2 text-center">
        <div className="mb-1.5 mt-3.5 grid place-items-center">
          <MarketingBrandLogo size={54} wordmark={false} variant="nav" />
        </div>
        <h3 className="mb-2 mt-2 text-[17px] font-bold tracking-[-0.01em] text-foreground">
          Your first workflow is live.
        </h3>
        <p
          role="status"
          className="mx-auto mb-[18px] max-w-[36ch] text-[13px] leading-relaxed text-muted-foreground"
        >
          ChainReact will run{" "}
          {completionWorkflow ? (
            <>
              <span className="font-medium text-foreground">
                {completionWorkflow.name}
              </span>{" "}
            </>
          ) : (
            "it "
          )}
          when its trigger occurs.
        </p>
        <div className="flex items-center justify-center gap-2">
          {/* Only linkable while the workflow row still exists — a snapshot-only
              completion names the workflow but has nowhere to navigate. */}
          {completionWorkflow?.id && (
            <Link
              href={`/workflows/${completionWorkflow.id}`}
              data-testid="onboarding-success-open-workflow"
              className="inline-flex items-center gap-[7px] rounded-[9px] bg-primary px-[13px] py-2 text-[13px] font-semibold text-primary-foreground transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open workflow
              <ObIcons.Arrow size={14} />
            </Link>
          )}
          <button
            type="button"
            onClick={onDone}
            data-testid="onboarding-success-done"
            className="rounded-[9px] px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Done
          </button>
        </div>
      </div>
    </section>
  );
}
