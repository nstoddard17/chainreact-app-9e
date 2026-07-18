import type { OnboardingStepDTO } from "@/contracts/onboarding";

/**
 * Where each step's CTA takes the user (5.ONBOARD-1 Batch 2).
 *
 * Navigation-only: these are plain hrefs into real surfaces — the CTA never
 * starts OAuth, saves config, runs, or activates. `create` has no href (it
 * opens the creation chooser instead).
 *
 * 5.ONBOARD-1 Batch 3 — the hrefs now carry the contextual deep-link params:
 * `/apps?highlight=<provider>` (scroll + highlight the first not-ready
 * provider's card) and `/workflows/[id]?focus=setup|test|activate` (one-shot
 * post-hydration builder focus). Both consumers are strictly navigation-only.
 */
export function stepHref(
  step: OnboardingStepDTO,
  selectedWorkflowId: string | null,
): string | null {
  switch (step.key) {
    case "create":
      return null;
    case "connect": {
      const target = (step.providers ?? []).find((p) => !p.ready);
      return target
        ? `/apps?highlight=${encodeURIComponent(target.provider)}`
        : "/apps";
    }
    case "configure":
      return selectedWorkflowId
        ? `/workflows/${selectedWorkflowId}?focus=setup`
        : null;
    case "test":
      return selectedWorkflowId
        ? `/workflows/${selectedWorkflowId}?focus=test`
        : null;
    case "activate":
      return selectedWorkflowId
        ? `/workflows/${selectedWorkflowId}?focus=activate`
        : null;
  }
}
