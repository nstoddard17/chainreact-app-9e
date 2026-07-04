/**
 * Local provider → category map for the Apps page (Slice 4.APPS-PAGE-1).
 *
 * V2 provider manifests do not carry a UI category today. Rather than mutate
 * the manifest schema (out of scope; would touch all 26 manifests + the
 * registry + structure tests), we keep a small route-layer map here. This is
 * explicitly NOT a free-form catalog — every key must match a registered
 * provider id, and unmapped providers fall back to `"Other"` so a future
 * addition can't render a blank category.
 *
 * Categories are stable user-facing labels. Adding a new provider:
 *   1. Register it in `integrations/_registry.ts` as usual.
 *   2. Add a `<id>: "<Category>"` entry here.
 *   3. If you need a new category label, add it to `APPS_CATEGORY_ORDER`.
 *
 * Localized descriptions also live here — `description()` returns a short
 * one-liner about what the provider does, used in the AppCard sub-line and
 * the search index. Strings stay generic ("Send and watch email.") — no
 * customer-attributed claims and no fabricated metrics.
 */

export type AppsCategory =
  | "Communication"
  | "Productivity"
  | "Storage"
  | "CRM"
  | "Marketing"
  | "Forms"
  | "E-commerce"
  | "Payments"
  | "Social"
  | "Analytics"
  | "Developer"
  | "Other";

/**
 * Ordered list of categories rendered in the sidebar. "All apps" is added by
 * the route layer; "Other" is rendered only when at least one provider falls
 * into it.
 */
export const APPS_CATEGORY_ORDER: readonly AppsCategory[] = [
  "Communication",
  "Productivity",
  "Storage",
  "CRM",
  "Marketing",
  "Forms",
  "E-commerce",
  "Payments",
  "Social",
  "Analytics",
  "Developer",
  "Other",
];

const PROVIDER_CATEGORIES: Readonly<Record<string, AppsCategory>> = {
  // Communication
  slack: "Communication",
  discord: "Communication",
  gmail: "Communication",
  "microsoft-outlook": "Communication",
  "microsoft-teams": "Communication",
  // Productivity
  notion: "Productivity",
  airtable: "Productivity",
  trello: "Productivity",
  monday: "Productivity",
  asana: "Productivity",
  "google-calendar": "Productivity",
  "google-docs": "Productivity",
  "google-sheets": "Productivity",
  "microsoft-excel": "Productivity",
  "microsoft-onenote": "Productivity",
  "microsoft-outlook-calendar": "Productivity",
  // Storage
  "google-drive": "Storage",
  "microsoft-onedrive": "Storage",
  dropbox: "Storage",
  // CRM
  hubspot: "CRM",
  // Marketing
  mailchimp: "Marketing",
  // Forms
  typeform: "Forms",
  // E-commerce
  shopify: "E-commerce",
  // Payments
  stripe: "Payments",
  // Social
  facebook: "Social",
  // Analytics
  "google-analytics": "Analytics",
  // Developer
  github: "Developer",
};

export function categoryFor(providerId: string): AppsCategory {
  return PROVIDER_CATEGORIES[providerId] ?? "Other";
}

const PROVIDER_DESCRIPTIONS: Readonly<Record<string, string>> = {
  slack: "Post messages, DMs, and reactions.",
  discord: "Post to servers and channels.",
  gmail: "Read, send, and label email.",
  "microsoft-outlook": "Send mail and watch your inbox.",
  "microsoft-teams": "Send messages and notifications to channels.",
  notion: "Insert rows and update pages.",
  airtable: "Read and write base records.",
  trello: "Update cards and lists.",
  monday: "Update boards, items, and statuses.",
  asana: "Create, update, and watch project tasks.",
  "google-calendar": "Watch events and create new ones.",
  "google-docs": "Watch and update documents.",
  "google-sheets": "Read and write spreadsheet rows.",
  "microsoft-excel": "Read and write workbook rows.",
  "microsoft-onenote": "Create and update notebook pages.",
  "microsoft-outlook-calendar": "Watch events and create new ones.",
  "google-drive": "Watch and upload files.",
  "microsoft-onedrive": "Watch and upload files.",
  dropbox: "Watch and upload files.",
  hubspot: "Sync contacts, deals, and tickets.",
  mailchimp: "Add subscribers and send campaigns.",
  typeform: "Watch form responses as they arrive.",
  shopify: "Watch orders, customers, and products.",
  stripe: "Watch charges and update customers.",
  facebook: "Watch posts and comments.",
  "google-analytics": "Pull reports and traffic metrics.",
  github: "Watch issues, PRs, and commits.",
};

export function descriptionFor(providerId: string): string {
  return PROVIDER_DESCRIPTIONS[providerId] ?? "";
}
