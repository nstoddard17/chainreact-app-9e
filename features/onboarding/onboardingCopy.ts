import type { OnboardingStepDTO, OnboardingStepKey } from "@/contracts/onboarding";
import type { ObIconName } from "./onboardingIcons";

/**
 * Checklist copy + per-step presentation mapping (5.ONBOARD-1 Batch 2).
 *
 * Voice ports the imported design's step rows ("Create your first workflow",
 * "Run a test execution"-style descriptions) onto the LOCKED product steps
 * (connect → create → configure → test → activate). The design's demo steps
 * ("Add a trigger", "Invite a teammate") and its "Mark done" fake-completion
 * affordance are deliberately NOT carried over.
 */

export interface StepPresentation {
  readonly label: string;
  readonly icon: ObIconName;
  readonly description: string;
  readonly cta: string;
}

export const STEP_PRESENTATION: Record<OnboardingStepKey, StepPresentation> = {
  connect: {
    label: "Connect an app",
    icon: "Database",
    description: "Connect an app you want to use in your workflows.",
    cta: "Open Apps",
  },
  create: {
    label: "Create your first workflow",
    icon: "Bolt",
    description:
      "Describe an automation to React, start from a template, or build from scratch.",
    cta: "New workflow",
  },
  configure: {
    label: "Finish configuring your steps",
    icon: "Settings",
    description: "Fill in the remaining required fields so every step is ready to run.",
    cta: "Open the builder",
  },
  test: {
    label: "Test the workflow",
    icon: "Play",
    description: "Run it once and watch the result before you go live.",
    cta: "Run a test",
  },
  activate: {
    label: "Activate your workflow",
    icon: "Sparkle",
    description: "Turn it on — ChainReact runs it whenever its trigger occurs.",
    cta: "Activate",
  },
};

/** Dynamic per-step description overrides driven by real derived state. */
export function stepDescription(step: OnboardingStepDTO): string {
  const base = STEP_PRESENTATION[step.key].description;
  // 5.ONBOARD-3: Connect has NO dynamic copy. It teaches the general action, so
  // it never names a provider or explains a scope/reconnect gap — that detail
  // lives on the Apps page and in the builder.
  if (step.key === "test") {
    if (step.waitingForFirstRun) {
      return "Waiting for the first successful run — we'll check this off automatically.";
    }
    if (step.testable === false) {
      return "Activate your workflow, and we'll confirm this step after its first successful run.";
    }
    if (step.lastRunFailed) {
      return "The last run failed — open the results to see why, then try again.";
    }
    return base;
  }
  return base;
}

/** CTA label overrides for derived states (null = hide the CTA entirely). */
export function stepCta(step: OnboardingStepDTO): string | null {
  // Connect always reads "Open Apps" — there is no reconnect/admin variant any
  // more, because the step no longer tracks a specific provider (5.ONBOARD-3).
  if (step.key === "test") {
    if (step.waitingForFirstRun) return null;
    if (step.testable === false) return null;
    if (step.lastRunFailed) return "Open the results";
  }
  return STEP_PRESENTATION[step.key].cta;
}
