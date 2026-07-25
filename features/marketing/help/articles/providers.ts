import type { HelpArticle } from "../helpTypes";

/**
 * Per-provider connect articles (HELP-CENTER-1).
 *
 * One short article per commonly used, launch-visible provider. Every claim
 * is sourced from the provider's own manifest (integrations/<id>/manifest.ts)
 * and the Apps-page description map (lib/apps/providerCategories.ts):
 *   - Slack / Gmail / Microsoft Outlook / QuickBooks Online / Motive connect
 *     through the provider's OAuth sign-in window (oauthFlows: ["v2"]).
 *   - Fleetio has NO OAuth (`authFlow: "credential_paste"`); its steps below
 *     restate the manifest's own credentialGuide.
 *   - Motive's one-company-per-connection note mirrors the manifest's
 *     company-scoping documentation.
 * `providerId` ties each article to the registry id so provider-scoped
 * surfaces can find it (see helpCatalog.helpArticleForProvider).
 */

/** Shared closing paragraph — what happens after connecting succeeds. */
const AFTER_CONNECT =
  "Once connected, the app's triggers and actions become available when you build workflows, and the connection is listed on the Apps page.";

export const PROVIDER_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "connect-slack",
    title: "Connect Slack to ChainReact",
    summary: "Let workflows post messages, DMs, and reactions in your Slack workspace.",
    category: "connecting-apps",
    providerId: "slack",
    keywords: ["slack", "channel", "message", "workspace", "chat"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "steps",
        items: [
          "Open the Apps page and find Slack.",
          "Select Connect — Slack's own authorization window opens.",
          "Choose your workspace, review the requested access, and approve it.",
          "You're returned to ChainReact with Slack connected.",
        ],
      },
      { kind: "paragraph", text: AFTER_CONNECT },
      {
        kind: "note",
        text: "On a team account, a Slack connection is shared with the account, so teammates' workflows can use it too.",
      },
    ],
    relatedArticleSlugs: ["connect-an-app", "create-your-first-workflow"],
  },
  {
    slug: "connect-gmail",
    title: "Connect Gmail to ChainReact",
    summary: "Let workflows read, send, and label email in your Gmail inbox.",
    category: "connecting-apps",
    providerId: "gmail",
    keywords: ["gmail", "google", "email", "inbox", "mail"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "steps",
        items: [
          "Open the Apps page and find Gmail.",
          "Select Connect — Google's sign-in window opens.",
          "Choose the Google account you want to connect and allow the requested access.",
          "You're returned to ChainReact with Gmail connected.",
        ],
      },
      { kind: "paragraph", text: AFTER_CONNECT },
      {
        kind: "note",
        text: "You can connect more than one Gmail account — each inbox is listed separately on the Apps page, and each workflow step picks which one it uses.",
      },
    ],
    relatedArticleSlugs: ["connect-an-app", "use-data-from-an-earlier-step"],
  },
  {
    slug: "connect-microsoft-outlook",
    title: "Connect Microsoft Outlook to ChainReact",
    summary: "Let workflows send mail and watch your Outlook inbox.",
    category: "connecting-apps",
    providerId: "microsoft-outlook",
    keywords: ["outlook", "microsoft", "email", "inbox", "mail", "office 365"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "steps",
        items: [
          "Open the Apps page and find Microsoft Outlook.",
          "Select Connect — Microsoft's sign-in window opens.",
          "Sign in with the Microsoft account you want to connect and accept the requested access.",
          "You're returned to ChainReact with Outlook connected.",
        ],
      },
      { kind: "paragraph", text: AFTER_CONNECT },
      {
        kind: "note",
        text: "Outlook mail and Outlook Calendar are separate apps in ChainReact — connect “Microsoft Outlook Calendar” as well if your workflows work with events.",
      },
    ],
    relatedArticleSlugs: ["connect-an-app", "understand-triggers-and-actions"],
  },
  {
    slug: "connect-quickbooks",
    title: "Connect QuickBooks Online to ChainReact",
    summary: "Let workflows create customers and invoices and watch payments in QuickBooks Online.",
    category: "connecting-apps",
    providerId: "quickbooks",
    keywords: ["quickbooks", "intuit", "accounting", "invoice", "payments", "bookkeeping"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "steps",
        items: [
          "Open the Apps page and find QuickBooks Online.",
          "Select Connect — Intuit's sign-in window opens.",
          "Sign in, pick the company you want to connect, and approve the requested access.",
          "You're returned to ChainReact with QuickBooks Online connected.",
        ],
      },
      { kind: "paragraph", text: AFTER_CONNECT },
      {
        kind: "note",
        text: "A connection is scoped to one QuickBooks company. If you manage more than one company, connect each of them — they're listed separately on the Apps page.",
      },
    ],
    relatedArticleSlugs: ["connect-an-app", "track-workflow-runs"],
  },
  {
    slug: "connect-motive",
    title: "Connect Motive to ChainReact",
    summary: "Let workflows log fuel purchases and watch fleet safety events from Motive.",
    category: "connecting-apps",
    providerId: "motive",
    keywords: ["motive", "keeptruckin", "fleet", "telematics", "fuel", "drivers", "vehicles"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "steps",
        items: [
          "Open the Apps page and find Motive.",
          "Select Connect — Motive's sign-in window opens.",
          "Sign in to your Motive account and approve the requested access.",
          "You're returned to ChainReact with Motive connected.",
        ],
      },
      { kind: "paragraph", text: AFTER_CONNECT },
      {
        kind: "note",
        text: "A Motive connection authorizes one company's data. If you operate more than one Motive company, connect each one — every company gets its own connection on the Apps page.",
      },
    ],
    relatedArticleSlugs: ["connect-an-app", "connect-fleetio"],
  },
  {
    slug: "connect-fleetio",
    title: "Connect Fleetio to ChainReact",
    summary:
      "Connect your Fleetio account with an API key so workflows can work with your fleet's maintenance data.",
    category: "connecting-apps",
    providerId: "fleetio",
    keywords: ["fleetio", "fleet", "maintenance", "api key", "account token", "vehicles"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Fleetio connects with an API key instead of a sign-in window. Both values ChainReact asks for come from one Fleetio settings page, and the connect form shows these same instructions.",
      },
      {
        kind: "steps",
        items: [
          "In Fleetio, open the Account menu → Settings → Manage API Keys.",
          "Select “+ Add API Key”, name it (for example “ChainReact”), and copy the key.",
          "Copy the Account Token shown at the bottom of that same page.",
          "In ChainReact, open the Apps page, find Fleetio, select Connect, and paste both values.",
          "ChainReact verifies the credentials with Fleetio right away — if they check out, Fleetio shows as connected.",
        ],
      },
      {
        kind: "note",
        text: "ChainReact can only do what the Fleetio user behind the key is allowed to do — we recommend a dedicated Fleetio user with least-privilege access for integrations. Fleetio API access requires their Professional or Premium plan.",
      },
    ],
    relatedArticleSlugs: ["connect-an-app", "connect-motive"],
  },
];
