/**
 * @jest-environment node
 *
 * Unit tests for the Microsoft Graph webhook trigger-smoke specs
 * (tests/trigger-smoke/microsoftGraphWebhookSmoke.ts) on the generic
 * direct-seed orchestrator, with injected fakes. No DB, no routes, no Graph.
 *
 * The orchestrator's step contract (baseline-first / exactly-one /
 * terminal / dedup / cleanup-always) is already covered by
 * directSeedWebhookSmoke.test.ts — here each Graph spec runs one fake
 * happy path (echoing its normalize-shaped payload + eventId) plus the
 * pure parts: the notification envelope builder, workflow configs, and
 * identityMatches accept/reject (marker lost, wrong subscription prefix,
 * wrong changeType suffix).
 */
import {
  runDirectSeedWebhookSmoke,
  type DirectSeedSmokeRun,
  type DirectSeedWebhookSmokeDeps,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import {
  buildGraphNotificationBody,
  ALL_GRAPH_WEBHOOK_SPECS,
  OUTLOOK_NEW_EMAIL_SPEC,
  OUTLOOK_EMAIL_FLAGGED_SPEC,
  ONEDRIVE_FILE_CHANGED_SPEC,
  TEAMS_NEW_CHANNEL_MESSAGE_SPEC,
  type GraphSpec,
  type GraphWebhookSmokeIdentity,
} from "@/tests/trigger-smoke/microsoftGraphWebhookSmoke";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;

const IDENTITY: GraphWebhookSmokeIdentity = {
  eventId: "crsmoke-sub-test-1",
  subscriptionId: "crsmoke-sub-test-1",
  clientState: "crsmoke-cs-test",
  marker: "crsmoke-testmarker",
};

/** Normalize-shaped run payload + eventId per spec (what the route persists). */
function firedRunFor(spec: GraphSpec, identity: GraphWebhookSmokeIdentity): DirectSeedSmokeRun {
  const changeType =
    spec.expectedEventType === "email_flagged" ||
    spec.expectedEventType === "event_changed" ||
    spec.expectedEventType === "file_changed"
      ? "updated"
      : "created";
  const discriminator =
    spec.expectedEventType === "file_changed"
      ? "2026-07-06T00:00:00Z" // lastModifiedDateTime — not a changeType
      : changeType;
  let payload: Record<string, unknown>;
  if (spec.provider === "microsoft-outlook") {
    payload = { messageId: "res-1", subject: `${identity.marker}-x safe to ignore` };
  } else if (spec.provider === "microsoft-outlook-calendar") {
    payload = {
      eventId: "res-1",
      changeType,
      subject: `${identity.marker} trigger-smoke event`,
    };
  } else if (spec.provider === "microsoft-onedrive") {
    payload = { itemId: "res-1", name: `${identity.marker}.txt`, changeType };
  } else {
    payload = {
      messageId: "res-1",
      teamId: "crsmoke-team",
      channelId: "crsmoke-channel",
      bodyContent: `${identity.marker} trigger-smoke channel message`,
    };
  }
  return {
    runId: "run-1",
    status: "queued",
    triggerPayload: payload,
    eventId: `${identity.subscriptionId}:res-1:${discriminator}`,
    eventType: spec.expectedEventType,
  };
}

function makeFakeDeps(
  spec: GraphSpec,
): DirectSeedWebhookSmokeDeps<GraphWebhookSmokeIdentity> {
  const runs: DirectSeedSmokeRun[] = [];
  const seen = new Set<string>();
  return {
    mintIdentity: () => IDENTITY,
    async createActiveSmokeWorkflow() {
      return { workflowId: "wf-test" };
    },
    async seedRegistration() {
      return { seededEventType: spec.expectedEventType };
    },
    async deliverSyntheticEvent({ identity }) {
      const fired = firedRunFor(spec, identity);
      if (!seen.has(fired.eventId!)) {
        seen.add(fired.eventId!);
        runs.push({ ...fired, runId: `run-${runs.length + 1}` });
      }
      return { httpStatus: 200 };
    },
    async listRuns() {
      return runs.map((r) => ({ ...r }));
    },
    async drainRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      if (run) (run as { status: DirectSeedSmokeRun["status"] }).status = "succeeded";
    },
    async readRun(runId) {
      return runs.find((r) => r.runId === runId) ?? null;
    },
    async cleanupRegistration() {
      /* tracked by orchestrator tests */
    },
    async cleanupDedup() {
      /* tracked by orchestrator tests */
    },
    async sleep() {
      /* no-op */
    },
  };
}

describe("Microsoft Graph specs — fake happy path via the generic orchestrator", () => {
  it.each(ALL_GRAPH_WEBHOOK_SPECS.map((s) => [s.label, s] as const))(
    "%s passes: seed canonical → baseline 0 → deliver → 1 run identified → succeeded → dedup holds",
    async (_label, spec) => {
      const r = await runDirectSeedWebhookSmoke(makeFakeDeps(spec), spec, FAST);
      expect(r.outcome).toBe("pass");
      expect(r.seededEventType).toBe(spec.expectedEventType);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.dedupProven).toBe(true);
      expect(r.cleaned).toBe(true);
    },
  );
});

describe("Graph notification envelope builder", () => {
  it("builds the documented change-notification shape (subscriptionId + clientState + resourceData.id)", () => {
    const body = JSON.parse(
      buildGraphNotificationBody(IDENTITY, {
        changeType: "created",
        resourceId: "msg-1",
        resource: "/me/messages/msg-1",
        odataType: "#Microsoft.Graph.chatMessage",
      }),
    ) as { value: Array<Record<string, unknown>> };
    expect(body.value).toHaveLength(1);
    const n = body.value[0]!;
    expect(n.subscriptionId).toBe(IDENTITY.subscriptionId);
    expect(n.clientState).toBe(IDENTITY.clientState);
    expect(n.changeType).toBe("created");
    expect((n.resourceData as Record<string, unknown>).id).toBe("msg-1");
    expect((n.resourceData as Record<string, unknown>)["@odata.type"]).toBe(
      "#Microsoft.Graph.chatMessage",
    );
  });

  it("omits @odata.type when not provided", () => {
    const body = JSON.parse(
      buildGraphNotificationBody(IDENTITY, {
        changeType: "updated",
        resourceId: "item-1",
        resource: "/me/drive/root",
      }),
    ) as { value: Array<Record<string, unknown>> };
    expect(body.value[0]!.resourceData).toEqual({ id: "item-1" });
  });
});

describe("Graph specs — pure parts", () => {
  it("spec inventory covers exactly the six registered Microsoft webhook triggers", () => {
    expect(ALL_GRAPH_WEBHOOK_SPECS.map((s) => `${s.provider}:${s.expectedEventType}`)).toEqual([
      "microsoft-outlook:new_email",
      "microsoft-outlook:email_sent",
      "microsoft-outlook:email_flagged",
      "microsoft-outlook-calendar:event_changed",
      "microsoft-onedrive:file_changed",
      "microsoft-teams:new_channel_message",
    ]);
  });

  it("teams workflow config carries the meta-required teamId + channelId", () => {
    const wf = TEAMS_NEW_CHANNEL_MESSAGE_SPEC.buildWorkflow();
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.config).toHaveProperty("teamId");
    expect(trigger.config).toHaveProperty("channelId");
  });

  it("new_email identity rejects a lost marker, a foreign subscription, and a wrong changeType", () => {
    const good = firedRunFor(OUTLOOK_NEW_EMAIL_SPEC, IDENTITY);
    expect(OUTLOOK_NEW_EMAIL_SPEC.identityMatches(good, IDENTITY)).toBe(true);
    expect(
      OUTLOOK_NEW_EMAIL_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, subject: "unrelated mail" } },
        IDENTITY,
      ),
    ).toBe(false);
    expect(
      OUTLOOK_NEW_EMAIL_SPEC.identityMatches(
        { ...good, eventId: "other-sub:res-1:created" },
        IDENTITY,
      ),
    ).toBe(false);
    expect(
      OUTLOOK_NEW_EMAIL_SPEC.identityMatches(
        { ...good, eventId: `${IDENTITY.subscriptionId}:res-1:updated` },
        IDENTITY,
      ),
    ).toBe(false);
  });

  it("email_flagged identity requires the updated changeType suffix", () => {
    const good = firedRunFor(OUTLOOK_EMAIL_FLAGGED_SPEC, IDENTITY);
    expect(OUTLOOK_EMAIL_FLAGGED_SPEC.identityMatches(good, IDENTITY)).toBe(true);
    expect(
      OUTLOOK_EMAIL_FLAGGED_SPEC.identityMatches(
        { ...good, eventId: `${IDENTITY.subscriptionId}:res-1:created` },
        IDENTITY,
      ),
    ).toBe(false);
  });

  it("file_changed identity accepts the lastModified discriminator and requires the marker filename", () => {
    const good = firedRunFor(ONEDRIVE_FILE_CHANGED_SPEC, IDENTITY);
    expect(ONEDRIVE_FILE_CHANGED_SPEC.identityMatches(good, IDENTITY)).toBe(true);
    expect(
      ONEDRIVE_FILE_CHANGED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, name: "unrelated.txt" } },
        IDENTITY,
      ),
    ).toBe(false);
  });
});
