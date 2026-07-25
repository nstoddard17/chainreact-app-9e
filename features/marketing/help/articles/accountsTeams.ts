import type { HelpArticle } from "../helpTypes";

/**
 * Accounts & teams articles (HELP-CENTER-1).
 *
 * Product truths pinned elsewhere and restated here without drift:
 *   - Roles gate MEMBER MANAGEMENT only — every member has full access to
 *     the account's workflows, apps, and runs (features/team/roleCopy.ts).
 *   - Member caps INCLUDE the owner: Team 5, Business 25
 *     (services/accounts/memberLimits.ts).
 *   - Members do not need their own paid plan; billing is per account.
 */
export const ACCOUNTS_TEAMS_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "invite-your-team",
    title: "Invite someone to your team",
    summary: "Add teammates to a Team or Business account with a one-time invite link.",
    category: "accounts-teams",
    keywords: ["invite", "team", "member", "add people", "share", "collaborate"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Team and Business accounts are shared: everyone works in the same account, with the same workflows, connected apps, and run history. Members don't need their own paid plan — membership grants access.",
      },
      {
        kind: "steps",
        items: [
          "Open the Team page.",
          "Enter the person's email address to create an invite.",
          "Share the one-time accept link with them — the invite shows as pending until they accept.",
          "When they accept, they appear in the members list with their role.",
        ],
      },
      {
        kind: "note",
        text: "Member limits include the owner: a Team account supports up to 5 members and a Business account up to 25. The Team page shows how many seats you've used.",
      },
    ],
    relatedArticleSlugs: ["understand-team-roles", "understand-task-usage"],
  },
  {
    slug: "understand-team-roles",
    title: "Understand team roles",
    summary: "Owner, Admin, and Member control who can manage people — not who can build workflows.",
    category: "accounts-teams",
    keywords: ["roles", "owner", "admin", "member", "permissions", "manage"],
    updatedAt: "2026-07-24",
    content: [
      {
        kind: "paragraph",
        text: "Every person in a Team or Business account has a role: Owner, Admin, or Member. Roles only control who can manage people — every member, whatever their role, has full access to the team's workflows, apps, and runs.",
      },
      {
        kind: "list",
        items: [
          "Owner — full control of the team: invites people, manages members, and owns the account.",
          "Admin — can invite new members and manage members, but can't manage the owner or other admins, and can't change billing.",
          "Member — full access to the team's workflows, apps, and runs; can't invite or manage people.",
        ],
      },
      {
        kind: "note",
        text: "If you need someone to stop having access entirely, remove them from the team — changing their role doesn't restrict what they can build or run.",
      },
    ],
    relatedArticleSlugs: ["invite-your-team", "manage-connected-apps"],
  },
];
