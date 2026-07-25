import type { HelpArticle } from "../helpTypes";

/**
 * Connecting-apps articles (HELP-CENTER-1).
 *
 * Reconnect / disconnect behavior and the "needs reconnecting" copy quoted
 * here match the Apps page (features/apps, ReconnectNeededCopy.tsx) and the
 * failed-run reconnect flow (core/errors/humanizeActionError.ts). The
 * personal-vs-shared connection distinction mirrors the public Security
 * page and core/integrations/credentialSharing.ts — no new claims.
 */
export const CONNECTING_APPS_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "fix-a-disconnected-app",
    title: "Fix a disconnected app",
    summary:
      "When a connected app's access expires or is revoked, reconnect it from the Apps page to get workflows running again.",
    category: "connecting-apps",
    keywords: ["reconnect", "disconnected", "expired", "revoked", "broken", "needs reconnection", "401"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "App connections can stop working: a password change, an expired authorization, or access revoked on the provider's side. When that happens, workflows that depend on the app fail with “An app needs to be reconnected”.",
      },
      {
        kind: "steps",
        items: [
          "Open the Apps page — the affected account is flagged as needing reconnecting.",
          "Select Reconnect on the flagged account and approve access again.",
          "Run the workflow again, or wait for its next trigger — once the app is reconnected, new runs go through normally.",
        ],
      },
      {
        kind: "note",
        text: "Only the flagged account needs reconnecting — your other connected accounts stay active. For personal connections, the person who originally connected the account is the one who must reconnect it.",
      },
    ],
    relatedArticleSlugs: ["troubleshoot-a-failed-run", "manage-connected-apps", "connect-an-app"],
  },
  {
    slug: "manage-connected-apps",
    title: "Manage your connected apps",
    summary:
      "See everything connected to your account, reconnect a specific connection, or disconnect one you no longer use.",
    category: "connecting-apps",
    keywords: ["apps", "connections", "disconnect", "remove", "accounts", "manage", "shared"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "The Apps page lists every app ChainReact supports and every account you've connected, grouped by category.",
      },
      {
        kind: "list",
        items: [
          "Connect adds a new account — you can connect several accounts of the same app side by side.",
          "Reconnect refreshes one specific account's access without touching your other connections.",
          "Disconnect removes a connection. Workflows that depend on it may stop running until the app is connected again.",
        ],
      },
      {
        kind: "paragraph",
        text: "On team accounts, some connections are shared: business tools like Slack or QuickBooks act as a shared company resource the whole account can use. Other connections are personal — teammates can't run workflows through your private connection, which keeps anyone from accidentally acting as you.",
      },
    ],
    relatedArticleSlugs: ["connect-an-app", "fix-a-disconnected-app"],
  },
];
