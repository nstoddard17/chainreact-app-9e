/**
 * @jest-environment node
 *
 * Tests that integrations/slack/triggers/index.ts registers all
 * shipped Slack filter implementations into the P-S2 filter registry.
 * Slack 2.1 shipped 5; Slack 2.2 Commit 2 adds slack.message.group;
 * Slack 2.2 Commit 3 adds 3 lifecycle filters.
 *
 * Pattern note: filterRegistry is module-level state. Within a single
 * Jest test file the registry survives across tests; importing
 * `integrations/slack/triggers` (which has the side-effect
 * registrations) is what populates it. We reset the registry at the
 * start so the assertions only see registrations from this test's
 * import chain.
 */
import {
  __resetTriggerFilterRegistryForTests,
  getTriggerFilter,
} from "@/core/triggers/filterRegistry";

beforeAll(() => {
  __resetTriggerFilterRegistryForTests();
  // Side-effect import — importing the trigger index registers every
  // filter declared in integrations/slack/triggers/index.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/integrations/slack/triggers");
});

describe("integrations/slack/triggers — P-S2 filter registration", () => {
  it("registers slack/slack.message.channel", () => {
    const filter = getTriggerFilter("slack", "slack.message.channel");
    expect(filter).not.toBeNull();
    expect(filter?.provider).toBe("slack");
    expect(filter?.eventType).toBe("slack.message.channel");
  });

  it("registers slack/slack.message.im", () => {
    expect(getTriggerFilter("slack", "slack.message.im")).not.toBeNull();
  });

  it("registers slack/slack.message.mpim", () => {
    expect(getTriggerFilter("slack", "slack.message.mpim")).not.toBeNull();
  });

  it("registers slack/slack.message.group (Slack 2.2 Commit 2 — private channel messages)", () => {
    expect(getTriggerFilter("slack", "slack.message.group")).not.toBeNull();
  });

  it("registers slack/slack.reaction_added", () => {
    expect(getTriggerFilter("slack", "slack.reaction_added")).not.toBeNull();
  });

  it("registers slack/slack.reaction_removed", () => {
    expect(getTriggerFilter("slack", "slack.reaction_removed")).not.toBeNull();
  });

  it("does NOT yet register filters for Slack 2.3 event types (file_shared, team_join)", () => {
    expect(getTriggerFilter("slack", "slack.file_shared")).toBeNull();
    expect(getTriggerFilter("slack", "slack.team_join")).toBeNull();
  });

  it("does NOT register filters for other providers (regression guard against cross-provider key collisions)", () => {
    expect(getTriggerFilter("github", "slack.message.channel")).toBeNull();
    expect(getTriggerFilter("gmail", "slack.reaction_added")).toBeNull();
  });
});
