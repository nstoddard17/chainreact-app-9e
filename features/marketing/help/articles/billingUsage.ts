import type { HelpArticle } from "../helpTypes";

/**
 * Billing & usage articles (HELP-CENTER-1).
 *
 * Definitions quoted from the live Pricing page and billing panel:
 * "A workflow task is one action your automation carries out when it runs.
 * Quietly watching for a trigger doesn't count." AI credits are metered
 * separately; deterministic checks stay free. Plan management claims match
 * features/account/BillingSection.tsx (upgrade panels, in-app cancel at
 * period end, Stripe "Manage billing" portal once a subscription exists).
 * No prices are repeated here — the Pricing page owns them.
 */
export const BILLING_USAGE_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "understand-task-usage",
    title: "Understand task usage",
    summary:
      "A workflow task is one action your automation carries out when it runs — here's how usage is counted and where to see it.",
    category: "billing-usage",
    keywords: ["tasks", "usage", "limit", "quota", "billing period", "allowance", "count"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "ChainReact plans include an allowance of workflow tasks per billing period. A workflow task is one action your automation carries out when it runs. Quietly watching for a trigger doesn't count.",
      },
      {
        kind: "paragraph",
        text: "Usage is counted at the account level and shared by everyone in the account — it isn't tracked per member.",
      },
      {
        kind: "steps",
        items: [
          "Open Account settings → Plan & billing.",
          "The Task usage row shows how much of this period's allowance you've used and when it resets.",
          "If you're running low, the row says so. When tasks run out, runs fail with “Task quota exhausted” until the period resets or you upgrade.",
        ],
      },
      {
        kind: "note",
        text: "Plan allowances and prices are listed on the Pricing page.",
      },
    ],
    relatedArticleSlugs: ["understand-ai-credits", "change-or-cancel-your-subscription"],
  },
  {
    slug: "understand-ai-credits",
    title: "Understand AI credits",
    summary: "AI features use AI credits, which are metered separately from workflow tasks.",
    category: "billing-usage",
    keywords: ["ai credits", "react agent", "ai usage", "credits", "metered"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Some ChainReact features use AI — like asking the React Agent for guidance while you build. These use AI credits, which are metered separately from workflow tasks.",
      },
      {
        kind: "paragraph",
        text: "Not everything costs credits: deterministic checks, like the builder's workflow check, run without AI and stay free.",
      },
      {
        kind: "steps",
        items: [
          "Open Account settings → Plan & billing.",
          "The AI credits row shows credits used and remaining for this period.",
          "When credits run out, AI features report “Out of AI credits” until the period resets or you upgrade.",
        ],
      },
    ],
    relatedArticleSlugs: ["understand-task-usage", "change-or-cancel-your-subscription"],
  },
  {
    slug: "change-or-cancel-your-subscription",
    title: "Change or cancel your subscription",
    summary: "Upgrade, cancel, or manage billing from Account settings — your account and data stay either way.",
    category: "billing-usage",
    keywords: ["cancel", "downgrade", "upgrade", "subscription", "plan", "billing", "payment", "invoice"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Plans are billed per account, not per seat, and everything is managed from Account settings → Plan & billing.",
      },
      {
        kind: "list",
        items: [
          "Upgrade plan — move up to a bigger plan directly from the billing panel.",
          "Cancel subscription — ends your plan at the end of the current billing period. Your account and data stay.",
          "Manage billing — once you have a paid subscription, this opens the secure billing portal for your payment method and invoices.",
        ],
      },
      {
        kind: "note",
        text: "Plan prices and what each plan includes are listed on the Pricing page.",
      },
    ],
    relatedArticleSlugs: ["understand-task-usage", "invite-your-team"],
  },
];
