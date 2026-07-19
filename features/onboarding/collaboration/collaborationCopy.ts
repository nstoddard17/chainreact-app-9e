import type {
  CollaborationStepKey,
  CollaborationTrack,
} from "@/contracts/collaborationOnboarding";
import type { ObIconName } from "../onboardingIcons";

/**
 * Collaboration checklist copy + destinations (5.ONBOARD-4).
 *
 * EVERY `href` IS NAVIGATION-ONLY. These are plain hrefs rendered as `next/link`s
 * — opening a page. None of them is an API endpoint, none carries an action verb
 * or a mutating query parameter, and none can invite, connect, run, activate,
 * change a role, or change billing. The user still performs the real action
 * behind the page's own permission-gated controls. Do not add a CTA here that
 * POSTs; the checklist teaches, it does not act on the user's behalf.
 *
 * Destinations verified to exist: `/team` (app/team/page.tsx), `/apps`
 * (app/apps/page.tsx), `/workflows` (app/workflows/page.tsx). Deliberately NOT
 * used: `/invitations/accept` (minted by the invitation service but has no page —
 * it 404s) and `/integrations` (permanent redirect to /apps).
 */

export interface CollaborationStepPresentation {
  readonly label: string;
  readonly icon: ObIconName;
  readonly description: string;
  readonly cta: string;
  readonly href: string;
}

export const COLLABORATION_STEP_PRESENTATION: Record<
  CollaborationStepKey,
  CollaborationStepPresentation
> = {
  invite_teammate: {
    label: "Invite a teammate",
    icon: "Users",
    description:
      "Send an invite so someone else can build and run automations in this account.",
    cta: "Manage team",
    href: "/team",
  },
  teammate_joined: {
    label: "Have a teammate join",
    icon: "Users",
    description:
      "We'll check this off once someone accepts your invite and joins the account.",
    cta: "View invitations",
    href: "/team",
  },
  connect_shared_app: {
    label: "Connect a shared app",
    icon: "Database",
    description:
      "Connect an app the whole account can build with, like Slack or HubSpot.",
    cta: "Open Apps",
    href: "/apps",
  },
  create_shared_workflow: {
    label: "Create a shared workflow",
    icon: "Bolt",
    description:
      "Build an automation here and everyone in the account can work on it.",
    cta: "Open workflows",
    href: "/workflows",
  },
  review_team: {
    label: "Review your team",
    icon: "Users",
    description:
      "Check who has access to this account and what their roles allow.",
    cta: "Manage team",
    href: "/team",
  },
  explore_workspace: {
    label: "Explore your team workspace",
    icon: "Sparkle",
    description:
      "Use the account switcher in the top bar to move between your Personal account and this shared one.",
    cta: "Open workflows",
    href: "/workflows",
  },
  open_shared_workflow: {
    label: "Open a shared workflow",
    icon: "Bolt",
    description:
      "Open one of your team's workflows to see how it's put together.",
    cta: "Browse workflows",
    href: "/workflows",
  },
  use_shared_workflow: {
    label: "Use a team workflow",
    icon: "Play",
    description:
      "Run or test a team workflow yourself — we'll check this off after your first successful run.",
    cta: "Browse workflows",
    href: "/workflows",
  },
  explore_directory: {
    label: "See your team's apps",
    icon: "Database",
    description:
      "Take a look at the apps this account has connected, and who you're working with.",
    cta: "Open Apps",
    href: "/apps",
  },
};

/** Card heading per track — names what THIS user is being taught. */
export const TRACK_TITLE: Record<CollaborationTrack, string> = {
  team_owner: "Set up your team account",
  team_admin: "Get your team running",
  team_member: "Get started with your team",
};

/** Sub-heading shown before any step is complete. */
export const TRACK_INTRO: Record<CollaborationTrack, string> = {
  team_owner: "A few steps to get your team working together.",
  team_admin: "A few steps to help get this account running.",
  team_member: "A quick tour of how your team works in ChainReact.",
};
