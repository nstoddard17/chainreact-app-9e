/**
 * Account-settings section model (Slice 4.ACCOUNT-SETTINGS-2).
 *
 * Mirrors the `Account Settings.html` left sub-nav: a grouped section list
 * (Personal / Workspace / Account control) driving a single content column.
 * Only the Account + Danger-zone sections are backed by real behavior today;
 * the rest are honest "coming soon" placeholders (no backend).
 */

export type AccountSection =
  | "profile"
  | "account"
  | "notifications"
  | "security"
  | "billing"
  | "api"
  | "danger-zone";

export const DEFAULT_ACCOUNT_SECTION: AccountSection = "account";

export interface AccountSectionHeading {
  title: string;
  sub: string;
}

/** Per-section breadcrumb title + subtitle (design copy, trimmed to honesty). */
export const ACCOUNT_SECTION_HEADINGS: Record<AccountSection, AccountSectionHeading> = {
  profile: {
    title: "Profile",
    sub: "How you appear across ChainReact.",
  },
  account: {
    title: "Account",
    sub: "Manage your personal account and the data tied to it.",
  },
  notifications: {
    title: "Notifications",
    sub: "Decide where ChainReact reaches you and what it tells you about.",
  },
  security: {
    title: "Security & access",
    sub: "Your sign-in credentials and connected identity providers.",
  },
  billing: {
    title: "Plan & billing",
    sub: "Your current plan and usage.",
  },
  api: {
    title: "API & webhooks",
    sub: "Programmatic access to ChainReact — keys and event endpoints.",
  },
  "danger-zone": {
    title: "Danger zone",
    sub: "Permanently delete your personal account.",
  },
};

export interface AccountNavItem {
  id: AccountSection;
  label: string;
  /** Monoline SVG path (single `<path d>`), rendered by the nav. */
  glyph: string;
  tone?: "danger";
}

export interface AccountNavGroup {
  head: string;
  items: readonly AccountNavItem[];
}

const GLYPH = {
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 20a8 8 0 0 1 16 0",
  account: "M4 6h16M4 12h16M4 18h16",
  notifications: "M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21h4",
  security: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14v9H5z",
  billing: "M3 7h18v10H3zM3 11h18",
  api: "M8 9l-3 3 3 3M16 9l3 3-3 3M13 7l-2 10",
  danger: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
} as const;

export const ACCOUNT_NAV_GROUPS: readonly AccountNavGroup[] = [
  {
    head: "Personal",
    items: [
      { id: "profile", label: "Profile", glyph: GLYPH.profile },
      { id: "account", label: "Account", glyph: GLYPH.account },
      { id: "notifications", label: "Notifications", glyph: GLYPH.notifications },
      { id: "security", label: "Security & access", glyph: GLYPH.security },
    ],
  },
  {
    head: "Workspace",
    items: [
      { id: "billing", label: "Plan & billing", glyph: GLYPH.billing },
      { id: "api", label: "API & webhooks", glyph: GLYPH.api },
    ],
  },
  {
    head: "Account control",
    items: [{ id: "danger-zone", label: "Danger zone", glyph: GLYPH.danger, tone: "danger" }],
  },
];

const ALL_SECTIONS = new Set<string>(
  ACCOUNT_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)),
);

/** Resolve a `?section=` value to a known section, falling back to the default. */
export function resolveAccountSection(raw: string | undefined): AccountSection {
  return raw && ALL_SECTIONS.has(raw) ? (raw as AccountSection) : DEFAULT_ACCOUNT_SECTION;
}
