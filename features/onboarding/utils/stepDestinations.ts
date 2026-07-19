import type { OnboardingStepDTO } from "@/contracts/onboarding";

/**
 * Where each step's CTA takes the user (5.ONBOARD-1 Batch 2).
 *
 * Navigation-only: these are plain hrefs into real surfaces — the CTA never
 * starts OAuth, saves config, runs, or activates. `create` has no href (it
 * opens the creation chooser instead).
 *
 * 5.ONBOARD-1 Batch 3 — the hrefs now carry the contextual deep-link params:
 * `/workflows/[id]?focus=setup|test|activate` (one-shot post-hydration builder
 * focus). Strictly navigation-only.
 *
 * 5.ONBOARD-3: connect no longer sends `?highlight=<provider>`. The step teaches
 * the general "connect an app" action and tracks no specific provider, so it
 * links to the plain Apps page.
 */
export function stepHref(step: OnboardingStepDTO): string | null {
  // 5.ONBOARD-2: the target comes from the STEP, not from a shared selection.
  // The server picks the workflow closest to satisfying that step (ties → most
  // recently updated), so each CTA lands where the work actually is. When no
  // workflow qualifies, `ctaWorkflowId` is absent and the caller routes to
  // creation instead.
  const workflowId = step.ctaWorkflowId ?? null;
  switch (step.key) {
    case "create":
      return null;
    case "connect":
      // 5.ONBOARD-3: always the plain Apps page. No `?highlight=<provider>`,
      // because the step no longer tracks a specific provider — and this is a
      // navigation link, so it never begins OAuth.
      return "/apps";
    case "configure":
      return workflowId ? `/workflows/${workflowId}?focus=setup` : null;
    case "test":
      return workflowId ? `/workflows/${workflowId}?focus=test` : null;
    case "activate":
      return workflowId ? `/workflows/${workflowId}?focus=activate` : null;
  }
}
