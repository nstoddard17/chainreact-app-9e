/**
 * @jest-environment node
 *
 * Tests that integrations/slack/triggers/index.ts registers all five
 * Slack 2.1 filter implementations into the P-S2 filter registry.
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
  // Side-effect import — this is the only thing the test does to set
  // up. Importing the trigger index registers the five filters.
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

  it("registers slack/slack.reaction_added", () => {
    expect(getTriggerFilter("slack", "slack.reaction_added")).not.toBeNull();
  });

  it("registers slack/slack.reaction_removed", () => {
    expect(getTriggerFilter("slack", "slack.reaction_removed")).not.toBeNull();
  });

  it("does NOT register filters for Slack 2.2 / 2.3 event types yet (channel_created, member_joined_channel, file_shared, team_join)", () => {
    expect(getTriggerFilter("slack", "slack.channel_created")).toBeNull();
    expect(getTriggerFilter("slack", "slack.member_joined_channel")).toBeNull();
    expect(getTriggerFilter("slack", "slack.member_left_channel")).toBeNull();
    expect(getTriggerFilter("slack", "slack.file_shared")).toBeNull();
    expect(getTriggerFilter("slack", "slack.team_join")).toBeNull();
  });

  it("does NOT register filters for other providers (regression guard against cross-provider key collisions)", () => {
    expect(getTriggerFilter("github", "slack.message.channel")).toBeNull();
    expect(getTriggerFilter("gmail", "slack.reaction_added")).toBeNull();
  });
});
