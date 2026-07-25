import type { HelpArticle } from "../helpTypes";

/**
 * Getting-started articles (HELP-CENTER-1).
 *
 * These five articles mirror the in-product onboarding checklist
 * ("Launch your first workflow", features/onboarding/onboardingCopy.ts):
 * connect an app → create a workflow → configure steps → test → activate.
 * Copy uses the product's real control labels (Test Workflow, Run Manually,
 * Activate, Publish changes) verified against the builder UI.
 */
export const GETTING_STARTED_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "connect-an-app",
    title: "Connect an app to ChainReact",
    summary:
      "Link the apps you already use — like Gmail, Slack, or QuickBooks — so your workflows can work with them.",
    category: "getting-started",
    keywords: ["connect", "oauth", "integration", "link", "apps page", "authorize", "sign in"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "ChainReact automates work by talking to the apps you already use. Before a workflow can send a Slack message or watch your inbox, you connect that app to your account.",
      },
      {
        kind: "steps",
        items: [
          "Open the Apps page from the main navigation.",
          "Find the app you want and select Connect.",
          "Most apps open the provider's own sign-in window — sign in and approve the requested access. A few apps (like Fleetio) ask you to paste an API key instead, and show step-by-step instructions for where to find it.",
          "When you're returned to the Apps page, the app shows as connected and is ready to use in workflows.",
        ],
      },
      {
        kind: "note",
        text: "You can connect more than one account for the same app — for example, two Gmail inboxes. Each connection is listed separately on the Apps page.",
      },
      {
        kind: "paragraph",
        text: "ChainReact asks only for the access its actions and triggers need, and never shows your passwords or access tokens back to you in the interface.",
      },
    ],
    relatedArticleSlugs: ["create-your-first-workflow", "manage-connected-apps", "fix-a-disconnected-app"],
  },
  {
    slug: "create-your-first-workflow",
    title: "Create your first workflow",
    summary:
      "Build an automation that runs itself: pick a trigger, add actions, and let ChainReact handle the busywork.",
    category: "getting-started",
    keywords: ["new workflow", "builder", "template", "automation", "start", "first"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "A workflow is an automation with two parts: a trigger (the event that starts it) and one or more actions (the work it does). You build workflows on a visual canvas — no code involved.",
      },
      {
        kind: "steps",
        items: [
          "Open the Workflows page and select New workflow.",
          "Choose how to start: describe the automation you want to the React Agent, start from a template, or build from scratch.",
          "Pick a trigger — the event that starts the workflow, like a new email arriving or a form response coming in.",
          "Add one or more actions — the steps the workflow performs, like posting a Slack message or creating an invoice.",
          "Configure each step, test the workflow, then turn it on.",
        ],
      },
      {
        kind: "note",
        text: "New workflows start as drafts. Nothing runs until you activate the workflow, so you can build and experiment freely.",
      },
    ],
    relatedArticleSlugs: ["understand-triggers-and-actions", "configure-workflow-steps", "connect-an-app"],
  },
  {
    slug: "configure-workflow-steps",
    title: "Configure each step of a workflow",
    summary: "Fill in each step's required fields so every part of the workflow is ready to run.",
    category: "getting-started",
    keywords: ["setup", "settings", "fields", "required", "configure", "step", "advanced"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Each step in a workflow has settings — which channel a message goes to, what an email's subject should be, which spreadsheet row to update. Select a step on the canvas to open its settings panel.",
      },
      {
        kind: "list",
        items: [
          "Setup shows the fields most workflows need. Required fields are marked, and any left unfinished are counted as setup issues.",
          "Advanced holds optional, power-user settings you can usually leave alone.",
          "Many fields are pickers that load real choices from your connected app — like your actual Slack channels — so you don't have to hunt for IDs.",
        ],
      },
      {
        kind: "paragraph",
        text: "Fields can also use data produced by your trigger or an earlier step — see “Use data from an earlier step” for how that works.",
      },
      {
        kind: "paragraph",
        text: "The issues indicator in the builder header lists anything still missing. A workflow with open setup issues can't be activated, so finish the flagged fields first.",
      },
    ],
    relatedArticleSlugs: ["use-data-from-an-earlier-step", "fix-workflow-setup-issues", "test-a-workflow"],
  },
  {
    slug: "test-a-workflow",
    title: "Test a workflow before turning it on",
    summary: "Run a safe test and watch the result before your workflow touches your real apps.",
    category: "getting-started",
    keywords: ["test", "test workflow", "run manually", "dry run", "safe", "try"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Before activating a workflow, run it once and watch what happens. The builder gives you two ways to run a workflow by hand.",
      },
      {
        kind: "list",
        items: [
          "Test Workflow runs safely without calling your connected apps. External actions are skipped and produce test-mode outputs, so nothing real is sent or changed.",
          "Run Manually runs for real and may call your connected apps. Destructive actions ask for a typed confirmation before they fire.",
        ],
      },
      {
        kind: "steps",
        items: [
          "Open your workflow in the builder.",
          "Select Test Workflow.",
          "Watch the run result — each step shows what it did (or would have done).",
          "If a step fails, open its result for a plain-language explanation, fix the step, and test again.",
        ],
      },
      {
        kind: "note",
        text: "Test runs are recorded in your run history with a Test marker. The Runs page has an “Include test runs” toggle if you'd rather hide them.",
      },
    ],
    relatedArticleSlugs: ["turn-on-a-workflow", "track-workflow-runs", "troubleshoot-a-failed-run"],
  },
  {
    slug: "turn-on-a-workflow",
    title: "Turn on a workflow",
    summary: "Activate your workflow so ChainReact runs it automatically whenever its trigger occurs.",
    category: "getting-started",
    keywords: ["activate", "turn on", "enable", "live", "pause", "resume", "publish"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "A draft workflow doesn't run on its own. When you're happy with a test run, activate it.",
      },
      {
        kind: "steps",
        items: [
          "In the builder, select Activate. If the button isn't available, the header shows the setup issues you still need to resolve.",
          "The workflow's status changes to Active — from now on, ChainReact runs it whenever its trigger occurs.",
          "Pause an active workflow any time and resume it later. The on/off switch on the Workflows page does the same thing.",
          "If you edit a workflow that's already active, select Publish changes to make the new version live.",
        ],
      },
      {
        kind: "note",
        text: "Being active costs nothing by itself — quietly watching for a trigger doesn't use workflow tasks. Tasks are counted when actions actually run.",
      },
    ],
    relatedArticleSlugs: ["test-a-workflow", "track-workflow-runs", "understand-task-usage"],
  },
];
