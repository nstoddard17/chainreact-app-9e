import type {
  OnboardingProviderEntry,
  OnboardingStepDTO,
  OnboardingStepKey,
} from "@/contracts/onboarding";
import type { ObIconName } from "./onboardingIcons";

/**
 * Checklist copy + per-step presentation mapping (5.ONBOARD-1 Batch 2).
 *
 * Voice ports the imported design's step rows ("Create your first workflow",
 * "Run a test execution"-style descriptions) onto the LOCKED product steps
 * (create → connect → configure → test → activate). The design's demo steps
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
  create: {
    label: "Create your first workflow",
    icon: "Bolt",
    description:
      "Describe an automation to React, start from a template, or build from scratch.",
    cta: "New workflow",
  },
  connect: {
    label: "Connect your apps",
    icon: "Database",
    description: "Link the apps this workflow reads from and writes to.",
    cta: "Open Apps",
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
  if (step.key === "connect") {
    if (step.blockedReason === "add_steps_first") {
      return "Add steps to your workflow first — then we'll show which apps it needs.";
    }
    if (step.blockedReason === "admin_required") {
      const names = blockedProviderNames(step.providers, (p) => p.adminRequired);
      return `A workspace owner or admin needs to connect ${names}.`;
    }
    if (step.blockedReason === "reconnect_required") {
      const names = blockedProviderNames(step.providers, (p) => p.reconnectNeeded);
      return `${names} needs to be reconnected before this workflow can run.`;
    }
    return base;
  }
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
  if (step.key === "connect") {
    if (step.blockedReason === "add_steps_first") return null;
    if (step.blockedReason === "admin_required") return null;
    if (step.blockedReason === "reconnect_required") return "Open Apps to reconnect";
  }
  if (step.key === "test") {
    if (step.waitingForFirstRun) return null;
    if (step.testable === false) return null;
    if (step.lastRunFailed) return "Open the results";
  }
  return STEP_PRESENTATION[step.key].cta;
}

function blockedProviderNames(
  providers: readonly OnboardingProviderEntry[] | undefined,
  match: (p: OnboardingProviderEntry) => boolean,
): string {
  const names = (providers ?? [])
    .filter((p) => !p.ready && match(p))
    .map((p) => p.name ?? p.provider);
  if (names.length === 0) return "this app";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
}
