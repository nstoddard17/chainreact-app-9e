import { expect, type Page } from "@playwright/test";

/**
 * 5.DUAL-BUILDER-1 CS-7G — the deterministic NON-EMPTY workflow the live Ask React
 * edit / stale / destructive mutation journeys run against.
 *
 * Shape (node ARRAY ORDER is load-bearing — `buildEditableWorkflowGraph` assigns opaque
 * refs `node_{i+1}` in array order, and the mock fixtures target those exact refs):
 *
 *   node_1  n-trigger   native:manual.run             — Manual Trigger (no config)
 *   node_2  n-notif     slack:send_channel_message    — "notification": channel + text SET
 *                                                        (the mock EDIT rewrites its `text`)
 *   node_3  n-reminder  slack:send_channel_message    — "reminder": text SET, CHANNEL UNSET
 *                                                        (the required-but-empty Finish-Setup item
 *                                                        that lives ELSEWHERE, untouched by edits)
 *   node_4  n-followup  slack:send_channel_message    — "follow-up": channel + text SET, the
 *                                                        safely-removable TAIL (the mock DESTRUCTIVE
 *                                                        removes it; its recipient `channel` is what
 *                                                        makes the apply-mode confirmation required)
 *
 * Linear edges trigger→notif→reminder→followup. Slack nodes need no live integration to exist
 * in a DRAFT (connection is only checked at activate/run), so no external credential is required.
 * Canonical ids are tracked here for API-level assertions; the UI journey never asserts on them.
 */

export const FIXTURE_NODE_IDS = {
  trigger: "n-trigger",
  notification: "n-notif",
  reminder: "n-reminder",
  followup: "n-followup",
} as const;

/** The notification's original message (the value the EDIT proposal rewrites to "Updated by React"). */
export const FIXTURE_NOTIFICATION_ORIGINAL_TEXT = "Original notification message";

export interface FixtureDefinition {
  nodes: Array<{
    id: string;
    kind: "trigger" | "action";
    provider: string;
    type: string;
    config: Record<string, unknown>;
    position: { x: number; y: number };
  }>;
  edges: Array<{ id: string; from: string; to: string; label?: string }>;
}

/** Build the deterministic 4-node editable fixture definition. Pure. */
export function buildEditableFixtureDefinition(): FixtureDefinition {
  return {
    nodes: [
      {
        id: FIXTURE_NODE_IDS.trigger,
        kind: "trigger",
        provider: "native",
        type: "manual.run",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: FIXTURE_NODE_IDS.notification,
        kind: "action",
        provider: "slack",
        type: "send_channel_message",
        config: { channel: "C0NOTIFY", text: FIXTURE_NOTIFICATION_ORIGINAL_TEXT },
        position: { x: 0, y: 160 },
      },
      {
        id: FIXTURE_NODE_IDS.reminder,
        kind: "action",
        provider: "slack",
        type: "send_channel_message",
        // channel UNSET → a required-but-empty field ELSEWHERE (the Finish-Setup item).
        config: { text: "Reminder body" },
        position: { x: 0, y: 320 },
      },
      {
        id: FIXTURE_NODE_IDS.followup,
        kind: "action",
        provider: "slack",
        type: "send_channel_message",
        config: { channel: "C0FOLLOW", text: "Follow up message" },
        position: { x: 0, y: 480 },
      },
    ],
    edges: [
      { id: "e-t-n", from: FIXTURE_NODE_IDS.trigger, to: FIXTURE_NODE_IDS.notification },
      { id: "e-n-r", from: FIXTURE_NODE_IDS.notification, to: FIXTURE_NODE_IDS.reminder },
      { id: "e-r-f", from: FIXTURE_NODE_IDS.reminder, to: FIXTURE_NODE_IDS.followup },
    ],
  };
}

/**
 * Seed the fixture into an EXISTING workflow via the real draft-save API, then reload so the
 * builder hydrates the live pending graph from it (the client then sends this exact draft as
 * `currentDraft`). Returns the definition it wrote for API-level before/after assertions.
 */
export async function seedEditableWorkflow(page: Page, workflowId: string): Promise<FixtureDefinition> {
  const draftDefinition = buildEditableFixtureDefinition();
  const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
    data: { draftDefinition },
  });
  expect(patch.status(), await patch.text()).toBe(200);
  await page.reload();
  return draftDefinition;
}
