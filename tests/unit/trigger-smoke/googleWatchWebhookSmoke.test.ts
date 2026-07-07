/**
 * @jest-environment node
 *
 * Unit tests for the Google watch-channel webhook trigger-smoke specs
 * (tests/trigger-smoke/googleWatchWebhookSmoke.ts) on the generic
 * direct-seed orchestrator, with injected fakes. No DB, no routes, no Google.
 *
 * The orchestrator's step contract is covered by
 * directSeedWebhookSmoke.test.ts — here each Google spec runs one fake happy
 * path (echoing its normalize-shaped payload + eventId) plus the pure parts:
 * the X-Goog header builder, workflow configs, identityMatches accept/reject,
 * and a REAL channel-token HMAC roundtrip (buildChannelToken →
 * verifyChannelToken, tamper rejected) against the production module.
 */
import {
  buildChannelToken,
  verifyChannelToken,
} from "@/integrations/_shared/google/channelToken";
import {
  runDirectSeedWebhookSmoke,
  type DirectSeedSmokeRun,
  type DirectSeedWebhookSmokeDeps,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import {
  buildGoogleWatchNotificationHeaders,
  ALL_GOOGLE_WATCH_SPECS,
  SHEETS_NEW_WORKSHEET_SPEC,
  SHEETS_ROW_CHANGED_SPEC,
  DOCS_NEW_DOCUMENT_SPEC,
  DOCS_DOCUMENT_UPDATED_SPEC,
  DRIVE_FILE_CHANGED_SPEC,
  CALENDAR_EVENT_CHANGED_SPEC,
  type GoogleWatchSpec,
  type GoogleWatchSmokeIdentity,
} from "@/tests/trigger-smoke/googleWatchWebhookSmoke";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;

const IDENTITY: GoogleWatchSmokeIdentity = {
  eventId: "crsmoke-chan-test-1",
  channelId: "crsmoke-chan-test-1",
  marker: "crsmoke-testmarker",
};

/** Normalize-shaped run payload + eventId per spec (what the route persists). */
function firedRunFor(
  spec: GoogleWatchSpec,
  identity: GoogleWatchSmokeIdentity,
): DirectSeedSmokeRun {
  let payload: Record<string, unknown>;
  let eventId: string;
  switch (spec.label) {
    case "google-sheets:new_worksheet":
      payload = {
        changeKind: "added",
        spreadsheetId: "ss-1",
        worksheetId: 42,
        worksheetName: identity.marker,
      };
      eventId = "ss-1:new_worksheet:42:abcdef123456";
      break;
    case "google-sheets:row_changed":
      payload = {
        changeKind: "added",
        spreadsheetId: "ss-1",
        sheetName: "Smoke",
        rowIndex: 2,
        rowValues: [identity.marker, "trigger-smoke", "safe to ignore"],
      };
      eventId = "ss-1:Smoke:2:abcdef123456";
      break;
    case "google-docs:new_document":
      payload = {
        changeKind: "created",
        documentId: "doc-1",
        title: `${identity.marker} trigger-smoke doc - safe to delete`,
      };
      eventId = "doc-1:2026-07-07T00:00:00Z";
      break;
    case "google-docs:document_updated":
      payload = {
        changeKind: "updated",
        documentId: "doc-1",
        title: `${identity.marker} trigger-smoke doc - safe to delete`,
      };
      eventId = "doc-1:2026-07-07T00:00:01Z";
      break;
    case "google-drive:file_changed":
      payload = {
        changeKind: "created",
        objectKind: "file",
        fileId: "file-1",
        name: `${identity.marker}.txt`,
      };
      eventId = "file-1:2026-07-07T00:00:00Z";
      break;
    default:
      payload = {
        changeKind: "created",
        calendarId: "primary",
        eventId: "ev-1",
        summary: `${identity.marker} trigger-smoke event - safe to ignore`,
      };
      eventId = "ev-1:2026-07-07T00:00:00Z";
      break;
  }
  return {
    runId: "run-1",
    status: "queued",
    triggerPayload: payload,
    eventId,
    eventType: spec.expectedEventType,
  };
}

function makeFakeDeps(
  spec: GoogleWatchSpec,
): DirectSeedWebhookSmokeDeps<GoogleWatchSmokeIdentity> {
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

describe("Google watch specs — fake happy path via the generic orchestrator", () => {
  it.each(ALL_GOOGLE_WATCH_SPECS.map((s) => [s.label, s] as const))(
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

describe("X-Goog notification header builder + REAL channel-token HMAC", () => {
  const OLD_SECRET = process.env.WATCH_CHANNEL_SECRET;
  beforeAll(() => {
    process.env.WATCH_CHANNEL_SECRET = "crsmoke-unit-test-secret";
  });
  afterAll(() => {
    if (OLD_SECRET === undefined) delete process.env.WATCH_CHANNEL_SECRET;
    else process.env.WATCH_CHANNEL_SECRET = OLD_SECRET;
  });

  it("builds the documented X-Goog-* header set (channel id + token + non-sync state)", () => {
    const headers = buildGoogleWatchNotificationHeaders(IDENTITY, {
      channelToken: "tok-1",
    });
    expect(headers["x-goog-channel-id"]).toBe(IDENTITY.channelId);
    expect(headers["x-goog-channel-token"]).toBe("tok-1");
    expect(headers["x-goog-resource-state"]).toBe("change");
    expect(headers["x-goog-message-number"]).toBe("2");
  });

  it("REAL buildChannelToken roundtrips through verifyChannelToken; tampering rejected", () => {
    const token = buildChannelToken({ channelId: IDENTITY.channelId });
    expect(verifyChannelToken({ channelId: IDENTITY.channelId }, token)).toBe(true);
    // Foreign channelId with a stolen token — the spoof scenario.
    expect(verifyChannelToken({ channelId: "other-channel" }, token)).toBe(false);
    // Forged token.
    expect(
      verifyChannelToken({ channelId: IDENTITY.channelId }, `${token}x`),
    ).toBe(false);
  });
});

describe("Google watch specs — pure parts", () => {
  it("spec inventory covers exactly the six registered Google watch triggers", () => {
    expect(ALL_GOOGLE_WATCH_SPECS.map((s) => `${s.provider}:${s.expectedEventType}`)).toEqual([
      "google-sheets:new_worksheet",
      "google-sheets:row_changed",
      "google-docs:new_document",
      "google-docs:document_updated",
      "google-drive:file_changed",
      "google-calendar:event_changed",
    ]);
  });

  it("sheets workflow configs carry the meta-required builder fields", () => {
    const nw = SHEETS_NEW_WORKSHEET_SPEC.buildWorkflow();
    expect(
      nw.definition.nodes.find((n) => n.id === nw.triggerNodeId)!.config,
    ).toHaveProperty("spreadsheetId");
    const rc = SHEETS_ROW_CHANGED_SPEC.buildWorkflow();
    const rcConfig = rc.definition.nodes.find((n) => n.id === rc.triggerNodeId)!.config!;
    expect(rcConfig).toHaveProperty("spreadsheetId");
    expect(rcConfig).toHaveProperty("sheetName");
    expect(rcConfig).toHaveProperty("changeKinds");
  });

  it("new_worksheet identity requires the marker name, the added kind, and the new_worksheet eventId infix", () => {
    const good = firedRunFor(SHEETS_NEW_WORKSHEET_SPEC, IDENTITY);
    expect(SHEETS_NEW_WORKSHEET_SPEC.identityMatches(good, IDENTITY)).toBe(true);
    expect(
      SHEETS_NEW_WORKSHEET_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, worksheetName: "Sheet2" } },
        IDENTITY,
      ),
    ).toBe(false);
    expect(
      SHEETS_NEW_WORKSHEET_SPEC.identityMatches(
        { ...good, eventId: "ss-1:Smoke:2:abcdef123456" },
        IDENTITY,
      ),
    ).toBe(false);
  });

  it("row_changed identity requires the marker cell and the added kind", () => {
    const good = firedRunFor(SHEETS_ROW_CHANGED_SPEC, IDENTITY);
    expect(SHEETS_ROW_CHANGED_SPEC.identityMatches(good, IDENTITY)).toBe(true);
    expect(
      SHEETS_ROW_CHANGED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, rowValues: ["unrelated"] } },
        IDENTITY,
      ),
    ).toBe(false);
    expect(
      SHEETS_ROW_CHANGED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, changeKind: "updated" } },
        IDENTITY,
      ),
    ).toBe(false);
  });

  it("new_document requires created; document_updated requires updated — kinds don't cross-match", () => {
    const created = firedRunFor(DOCS_NEW_DOCUMENT_SPEC, IDENTITY);
    expect(DOCS_NEW_DOCUMENT_SPEC.identityMatches(created, IDENTITY)).toBe(true);
    expect(
      DOCS_NEW_DOCUMENT_SPEC.identityMatches(
        { ...created, triggerPayload: { ...created.triggerPayload!, changeKind: "updated" } },
        IDENTITY,
      ),
    ).toBe(false);
    const updated = firedRunFor(DOCS_DOCUMENT_UPDATED_SPEC, IDENTITY);
    expect(updated.eventType).toBe("document_updated");
    expect(DOCS_DOCUMENT_UPDATED_SPEC.identityMatches(updated, IDENTITY)).toBe(true);
    expect(
      DOCS_DOCUMENT_UPDATED_SPEC.identityMatches(
        { ...updated, triggerPayload: { ...updated.triggerPayload!, title: "unrelated doc" } },
        IDENTITY,
      ),
    ).toBe(false);
  });

  it("file_changed identity requires the exact marker filename, created kind, and file objectKind", () => {
    const good = firedRunFor(DRIVE_FILE_CHANGED_SPEC, IDENTITY);
    expect(DRIVE_FILE_CHANGED_SPEC.identityMatches(good, IDENTITY)).toBe(true);
    expect(
      DRIVE_FILE_CHANGED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, name: "unrelated.txt" } },
        IDENTITY,
      ),
    ).toBe(false);
    expect(
      DRIVE_FILE_CHANGED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, objectKind: "folder" } },
        IDENTITY,
      ),
    ).toBe(false);
  });

  it("event_changed identity requires the marker summary and the created kind", () => {
    const good = firedRunFor(CALENDAR_EVENT_CHANGED_SPEC, IDENTITY);
    expect(CALENDAR_EVENT_CHANGED_SPEC.identityMatches(good, IDENTITY)).toBe(true);
    expect(
      CALENDAR_EVENT_CHANGED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, summary: "unrelated meeting" } },
        IDENTITY,
      ),
    ).toBe(false);
    expect(
      CALENDAR_EVENT_CHANGED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, changeKind: "cancelled" } },
        IDENTITY,
      ),
    ).toBe(false);
  });
});
