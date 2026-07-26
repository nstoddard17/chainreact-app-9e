import type { HelpCategoryDef } from "./helpTypes";

/**
 * Help Center categories (HELP-CENTER-1).
 *
 * Ordered as rendered in the "Browse by topic" grid. Category ids are part
 * of the stable-linking contract (see helpTypes.ts) — never rename or reuse
 * one once shipped. Labels use the product's user-facing vocabulary
 * (workflow / app / run / task), not internal terms.
 */
export const HELP_CATEGORIES: readonly HelpCategoryDef[] = [
  {
    id: "getting-started",
    label: "Getting started",
    blurb: "Connect your first app and take a workflow from draft to active.",
  },
  {
    id: "workflows",
    label: "Workflows",
    blurb: "Triggers, actions, step data, and keeping an eye on your runs.",
  },
  {
    id: "connecting-apps",
    label: "Connecting apps",
    blurb: "Connect, reconnect, and manage the apps your workflows use.",
  },
  {
    id: "analytics",
    label: "Analytics",
    blurb: "Build charts from your workflow runs and your connected apps.",
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    blurb: "Work out why a run failed or a workflow won't activate — and fix it.",
  },
  {
    id: "accounts-teams",
    label: "Accounts and teams",
    blurb: "Invite teammates, understand roles, and share one account.",
  },
  {
    id: "billing-usage",
    label: "Billing and usage",
    blurb: "Plans, workflow tasks, AI credits, and changing your subscription.",
  },
];

export function helpCategoryLabel(id: HelpCategoryDef["id"]): string {
  const found = HELP_CATEGORIES.find((c) => c.id === id);
  return found ? found.label : id;
}
