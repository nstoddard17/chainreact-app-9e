import type { ConnectedAppSourceUi } from "./connectedAppSources";

/**
 * Facebook connected-app analytics UI descriptor — Slice ANALYTICS-SOURCES-FACEBOOK-1.
 * Split out of connectedAppSources.ts to keep that module under its line cap. Pure data
 * — type-only import, no runtime cycle.
 *
 * Personal connection (each viewer sees data from THEIR OWN Facebook connection). Page
 * tokens are derived server-side and never surfaced. Aggregate/count-only metrics:
 * managed-page count (no picker), and page fan/followers/post counts + posts-over-time
 * (require a Page picker via the facebook:pages resolver).
 */
export const FACEBOOK: ConnectedAppSourceUi = {
  provider: "facebook",
  displayName: "Facebook",
  exposed: true,
  icon: "Comment",
  connectHref: "/apps",
  connectTitle: "Connect your Facebook",
  connectHelp: "This widget uses your own Facebook connection. Connect it to see your data.",
  connectCtaLabel: "Connect Facebook",
  visibility: "personal",
  attributionPrefix: "Your Facebook",
  metricsByType: {
    stat: [
      { id: "pages_count", label: "Managed Pages", filters: [] },
      { id: "page_fan_count", label: "Page likes", filters: ["facebook_page"] },
      { id: "page_followers_count", label: "Page followers", filters: ["facebook_page"] },
      { id: "page_posts_count", label: "Posts", filters: ["facebook_page"] },
    ],
    line: [{ id: "page_posts_over_time", label: "Posts over time", filters: ["facebook_page"] }],
    bar: [{ id: "page_posts_over_time", label: "Posts over time", filters: ["facebook_page"] }],
  },
};
