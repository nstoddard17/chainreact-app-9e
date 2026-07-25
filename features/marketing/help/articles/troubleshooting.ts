import type { HelpArticle } from "../helpTypes";

/**
 * Troubleshooting articles (HELP-CENTER-1).
 *
 * The failed-run titles quoted here ("An app needs to be reconnected",
 * "Task quota exhausted", …) are the real humanized error titles from
 * core/errors/humanizeActionError.ts — if those change, update this copy.
 */
export const TROUBLESHOOTING_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "troubleshoot-a-failed-run",
    title: "Troubleshoot a failed workflow run",
    summary:
      "Open the failed run, read the plain-language explanation, and follow its suggested fix.",
    category: "troubleshooting",
    keywords: ["failed", "error", "run", "fix", "broken", "not working", "why"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "When a run fails, ChainReact explains what went wrong in plain language and, where possible, gives you a button that goes straight to the fix.",
      },
      {
        kind: "steps",
        items: [
          "Open the Runs page and select the failed run.",
          "Read the error card — it names the problem and the next step.",
          "Follow the suggested action, then run the workflow again or wait for its next trigger.",
        ],
      },
      { kind: "heading", text: "Common failures and what they mean" },
      {
        kind: "list",
        items: [
          "“An app needs to be reconnected” — a connected app rejected the request because its access expired or was revoked. Use the Reconnect app button.",
          "“An app needs additional permission” — reconnecting the app grants the missing permission.",
          "“A connected app didn't respond in time” — usually temporary on the provider's side; try again later.",
          "“Task quota exhausted” — your plan's workflow tasks for this period are used up. Upgrade your plan or wait for the reset.",
          "“Workflow needs setup” — a step is missing required configuration. Use Fix workflow setup to open the builder on the problem.",
        ],
      },
      {
        kind: "note",
        text: "Error details deliberately keep secrets and raw app responses out of view — you always get a safe summary and a next step instead.",
      },
    ],
    relatedArticleSlugs: ["fix-a-disconnected-app", "fix-workflow-setup-issues", "understand-task-usage"],
  },
  {
    slug: "fix-workflow-setup-issues",
    title: "Fix workflow setup issues",
    summary: "Resolve the builder's flagged setup issues so your workflow can activate and run.",
    category: "troubleshooting",
    keywords: ["setup issues", "activate disabled", "required fields", "validation", "incomplete", "can't activate"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "The builder continuously checks that every step has what it needs. Unfinished required fields show up as setup issues, and a workflow with open issues can't be activated — that's a guardrail, not a bug.",
      },
      {
        kind: "steps",
        items: [
          "Open the workflow in the builder.",
          "Select the issues indicator in the header to see what's outstanding.",
          "Open each flagged step and fill in the missing fields.",
          "When the list is empty, Activate becomes available.",
        ],
      },
      {
        kind: "note",
        text: "Runs can also fail with “Workflow needs setup” if an active workflow is missing configuration — the run's error card links you straight back to the builder.",
      },
    ],
    relatedArticleSlugs: ["configure-workflow-steps", "turn-on-a-workflow"],
  },
];
