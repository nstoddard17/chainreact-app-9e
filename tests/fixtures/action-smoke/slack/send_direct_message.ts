import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:send_direct_message (sendSafe) — send a deterministic crsmoke- DM to a REAL
 * throwaway-workspace user, then prove delivery via an INDEPENDENT conversations.history
 * read-back of the opened DM channel.
 *
 *   execute  send_direct_message -> conversations.open(users: SMOKE_SLACK_INVITE_USER_ID)
 *            resolves the 1:1 DM channel (idempotent), then chat.postMessage posts a
 *            `{{smokeMarker}}dm` message. Capture the resolved DM channel id (`D…`) into
 *            ledger key "dm" (the bot opened it, so it is a member and can read it back).
 *   verify   get_messages -> INDEPENDENT conversations.history of the DM channel; assert
 *            the run marker (+ "dm" suffix) is PRESENT in the serialized `messages` (the
 *            send echo is never trusted; the unique run marker means only THIS run's DM
 *            can match). DMs are readable via the granted `im:history` scope.
 *
 * DISPOSITION: none. A sent DM is DELIVERED (sendSafe: no provider cleanup) — a
 * clearly-marked, ignorable crsmoke- message to the throwaway workspace user is the
 * accepted artifact. chat.delete could remove the message, but that needs BOTH the DM
 * channel AND the message ts, and the write harness captures only ONE id per step; the
 * sendSafe contract already treats a delivered smoke message as a harmless artifact, so
 * no deletion is attempted. Each run leaves one marked DM.
 *
 * The recipient is a REAL member of the throwaway workspace discovered from users.list
 * (discoverSlackSmokeUser — never invented, never a bot, never Slackbot). Absent one ->
 * SMOKE_SLACK_INVITE_USER_ID unset -> BLOCKED_ENV. Scope: `im:write` + `chat:write`
 * (send) + `im:history` (read-back).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "send_direct_message",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    userId: "{{env.SMOKE_SLACK_INVITE_USER_ID}}",
    text: "{{smokeMarker}}dm ChainReact action-smoke - safe to ignore",
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_INVITE_USER_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "sendSafe",
    smokeMarker: "crsmoke-",
    // The execute output's `channel` is the resolved DM channel id (D…) — capture it so
    // the verify can read that exact DM back. (The bot opened it, so it is a member.)
    captureResource: { resourceKey: "dm", idPath: "channel", kind: "dm_channel" },
    verify: {
      provider: "slack",
      action: "get_messages",
      config: { channel: "{{ledger.dm.id}}", limit: 30 },
      markerPath: "messages",
      markerSuffix: "dm",
    },
    // No cleanup: a sent DM is delivered (sendSafe). The marked message is the artifact.
  },
  notes:
    "send_direct_message to a discovered throwaway user -> get_messages read-back of the " +
    "opened DM proves the marker is delivered. sendSafe; delivered-DM artifact (no " +
    "cleanup - a sent message is delivered).",
});
