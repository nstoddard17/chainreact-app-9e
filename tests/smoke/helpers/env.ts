import path from "node:path";

/**
 * Production smoke-suite environment plumbing.
 *
 * Everything the suite needs is sourced from env vars so the same specs run
 * against production safely and repeatably without hardcoded URLs or secrets:
 *
 *   - PRODUCTION_SMOKE_BASE_URL   (default https://chainreact.app)
 *   - PRODUCTION_SMOKE_EMAIL      (authenticated smoke; absent → those specs skip)
 *   - PRODUCTION_SMOKE_PASSWORD   (authenticated smoke; absent → those specs skip)
 *   - PRODUCTION_SMOKE_PREFIX     (disposable-workflow name prefix; default "Smoke Test")
 *   - PRODUCTION_SMOKE_RUN_EXECUTION  ("true" PERMITS real external execution/
 *                                       posting; default OFF → live-run steps are
 *                                       skipped. Gates the builder HTTP run AND the
 *                                       Slack message post — readiness/save/config
 *                                       checks still run.)
 *   - PRODUCTION_SMOKE_SLACK_CHANNEL_NAME  (visible Slack channel name, e.g. "general"
 *                                       or "#general"; CONFIGURES the target channel.
 *                                       Absent → the Slack action smoke self-skips. A
 *                                       channel name alone does NOT post — the real
 *                                       send additionally requires RUN_EXECUTION=true.)
 *
 * NEVER hardcode credentials OR channel names here. The values come from the
 * shell / CI secret store.
 */

export const DEFAULT_BASE_URL = "https://chainreact.app";

export function baseUrl(): string {
  return process.env.PRODUCTION_SMOKE_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function smokeEmail(): string | undefined {
  return process.env.PRODUCTION_SMOKE_EMAIL?.trim() || undefined;
}

export function smokePassword(): string | undefined {
  return process.env.PRODUCTION_SMOKE_PASSWORD || undefined;
}

export function hasSmokeCredentials(): boolean {
  return Boolean(smokeEmail() && smokePassword());
}

/**
 * Visible Slack channel name the Slack-action smoke posts to (e.g. "general"
 * or "#general"). Never an ID — the smoke selects the channel by its visible
 * picker label, and the builder stores the underlying id itself.
 */
export function smokeSlackChannelName(): string | undefined {
  return process.env.PRODUCTION_SMOKE_SLACK_CHANNEL_NAME?.trim() || undefined;
}

/**
 * The Slack-action smoke is collected only when credentials AND a target
 * channel name are present — the channel name configures WHERE a message would
 * go. It does NOT by itself authorize posting: the real send is additionally
 * gated by PRODUCTION_SMOKE_RUN_EXECUTION=true (see RUN_EXECUTION), so the safe
 * build/config/readiness checks can run as a dry run without touching Slack.
 */
export function hasSlackSmokeConfig(): boolean {
  return hasSmokeCredentials() && Boolean(smokeSlackChannelName());
}

/**
 * Prefix every smoke-created workflow shares. Cleanup ONLY ever touches a
 * workflow whose name starts with this prefix — the safety contract that keeps
 * the suite from deleting unrelated production workflows.
 */
export const SMOKE_PREFIX = process.env.PRODUCTION_SMOKE_PREFIX?.trim() || "Smoke Test";

/**
 * Opt-in flag for actually executing live runs that cause real external side
 * effects. Default OFF: a genuine outbound call from production infra (the
 * builder smoke's HTTP request, the Slack smoke's chat.postMessage) — and the
 * task-quota spend — is gated behind this single switch. When off, the builder
 * spec still proves readiness → save → reopen → persistence, and the Slack spec
 * still proves channel-pick-by-name → readiness without posting anything.
 */
export const RUN_EXECUTION = process.env.PRODUCTION_SMOKE_RUN_EXECUTION === "true";

/** Where the authenticated storage state is cached (gitignored). */
export const STORAGE_STATE = path.join(__dirname, "..", ".auth", "state.json");

/** Build a unique disposable workflow name, e.g. "Smoke Test 1736012345678-4821". */
export function uniqueWorkflowName(): string {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  return `${SMOKE_PREFIX} ${suffix}`;
}
