import type { HelpArticle } from "../helpTypes";

/**
 * Workflow-concept articles (HELP-CENTER-1).
 *
 * Explains the building blocks in the product's own vocabulary: workflow,
 * trigger, action, step, run. Run statuses (Queued / Running / Succeeded /
 * Failed) and the run-source labels quoted here match features/runs.
 */
export const WORKFLOWS_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "understand-triggers-and-actions",
    title: "Understand triggers and actions",
    summary:
      "Triggers start a workflow; actions do the work. Together they're the building blocks of every automation.",
    category: "workflows",
    keywords: ["trigger", "action", "event", "step", "branch", "basics", "how it works"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Every workflow starts with a trigger — an event ChainReact watches for, like “a new email arrives”, “a form response comes in”, or “I ran this manually”.",
      },
      {
        kind: "paragraph",
        text: "Actions are the steps that run after the trigger fires: send a message, create an invoice, update a spreadsheet row. A workflow can have a single action or a whole chain, and workflows can branch so different situations take different paths.",
      },
      {
        kind: "list",
        items: [
          "When a Typeform response arrives → post a summary in Slack.",
          "When a payment comes in through QuickBooks → send a thank-you email from Gmail.",
          "When I run this manually → remind the team in a Slack channel.",
        ],
      },
      {
        kind: "note",
        text: "Each trigger and action belongs to an app. The first time you use one of an app's steps, you'll be asked to connect that app.",
      },
    ],
    relatedArticleSlugs: ["create-your-first-workflow", "use-data-from-an-earlier-step"],
  },
  {
    slug: "use-data-from-an-earlier-step",
    title: "Use data from an earlier step",
    summary:
      "Reuse what your trigger or an earlier step produced — like an email's subject — inside later steps.",
    category: "workflows",
    keywords: ["variable", "data", "mapping", "output", "insert", "token", "earlier step", "dynamic"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Steps aren't isolated: an action can use data produced by the trigger or by any earlier step. That's how “when an email arrives, post its subject in Slack” works — the Slack step reuses the email's subject.",
      },
      {
        kind: "steps",
        items: [
          "Open the step's settings in the builder.",
          "In the field where you want dynamic data, open the field's variable picker.",
          "Pick the value you want — for example the trigger's subject line, or a customer name produced by an earlier step.",
          "The value appears in the field as a token. When the workflow runs, the token is replaced with the real value from that run.",
        ],
      },
      {
        kind: "note",
        text: "Later steps can only use data from steps that actually ran before them. If an earlier step failed or was skipped, its output isn't available downstream.",
      },
    ],
    relatedArticleSlugs: ["configure-workflow-steps", "understand-triggers-and-actions"],
  },
  {
    slug: "track-workflow-runs",
    title: "Track your workflow runs",
    summary:
      "The Runs page shows every time a workflow ran, whether it succeeded, and why it failed if it didn't.",
    category: "workflows",
    keywords: ["runs", "history", "log", "status", "succeeded", "failed", "queued", "monitor"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Every time a workflow fires, ChainReact records a run. The Runs page lists them for the account you're working in, newest first.",
      },
      {
        kind: "list",
        items: [
          "Each run shows a status: Queued, Running, Succeeded, or Failed.",
          "A source label shows what started the run — Manual, Test, Webhook, Scheduled, and so on.",
          "Filters narrow the list to Succeeded or Failed runs, and the “Include test runs” toggle controls whether test runs appear.",
        ],
      },
      {
        kind: "paragraph",
        text: "Open a failed run to see a plain-language explanation of what went wrong and a suggested next step — see “Troubleshoot a failed workflow run”.",
      },
    ],
    relatedArticleSlugs: ["troubleshoot-a-failed-run", "test-a-workflow"],
  },
];
