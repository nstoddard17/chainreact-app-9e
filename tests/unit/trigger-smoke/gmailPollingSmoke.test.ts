/**
 * @jest-environment node
 *
 * Unit tests for the Gmail polling trigger-smoke orchestrator
 * (tests/trigger-smoke/gmailPollingSmoke.ts) with injected fakes. No DB, no
 * Gmail. The fake models the essentials of the real poll loop: a history
 * cursor, history events with sequence numbers, and a dedup set keyed by the
 * spec's per-trigger prefixed key — so the orchestrator's WATERMARK proof
 * (advanced cursor fires nothing) and DEDUP proof (rewound cursor re-surfaces
 * the event, dedup drops it) are both exercised for real.
 *
 * Also proves the pure spec parts: workflow configs carry the deterministic
 * marker filters / required labelId, dedup keys use the per-trigger prefixes
 * ("" / "labeled:" / "attachment:"), and identityMatches accepts the
 * hydration-shaped payload and rejects corruption.
 */
import {
  runGmailPollingSmoke,
  GMAIL_NEW_EMAIL_SPEC,
  GMAIL_NEW_LABELED_EMAIL_SPEC,
  GMAIL_NEW_ATTACHMENT_SPEC,
  ALL_GMAIL_POLLING_SPECS,
  type GmailPollingRun,
  type GmailPollingSmokeContext,
  type GmailPollingSmokeDeps,
  type GmailPollingTriggerSpec,
} from "@/tests/trigger-smoke/gmailPollingSmoke";

const FAST = { afterPollAttempts: 1, afterPollSleepMs: 0 } as const;

const MARKER = "crsmoke-test-marker";
const LABEL_ID = "Label_crsmoke_test";
const CTX_PLAIN: GmailPollingSmokeContext = { marker: MARKER };
const CTX_LABELED: GmailPollingSmokeContext = {
  marker: MARKER,
  labelId: LABEL_ID,
  labelName: `${MARKER}-label`,
};

function payloadFor(
  spec: GmailPollingTriggerSpec,
  messageId: string,
  fileName: string,
): Record<string, unknown> {
  if (spec.eventType === "new_labeled_email") {
    return {
      id: messageId,
      subject: MARKER,
      labelAppliedId: LABEL_ID,
      labelsAdded: [LABEL_ID],
    };
  }
  if (spec.eventType === "new_attachment") {
    return {
      id: messageId,
      subject: `${MARKER}-attachseed`,
      attachments: [{ filename: fileName, mimeType: "text/plain" }],
      attachmentCount: 1,
    };
  }
  return { id: messageId, subject: MARKER };
}

interface FakeOpts {
  armedHistoryId?: string | null;
  preexistingRuns?: number;
  suppressRun?: boolean;
  corruptPayload?: boolean;
  drainStatus?: GmailPollingRun["status"];
  dedupBroken?: boolean;
  watermarkBroken?: boolean;
  throwOnChange?: boolean;
}

interface FakeState {
  labelCreated: boolean;
  labelDeleted: boolean;
  messageTrashed: boolean;
  workflowCleaned: boolean;
  dedupCleaned: boolean;
  polls: number;
}

function makeFakeDeps(
  spec: GmailPollingTriggerSpec,
  opts: FakeOpts = {},
): { deps: GmailPollingSmokeDeps; state: FakeState } {
  const runs: GmailPollingRun[] = [];
  for (let i = 0; i < (opts.preexistingRuns ?? 0); i += 1) {
    runs.push({ runId: `pre-${i}`, status: "queued", triggerPayload: null, eventId: null, eventType: null });
  }
  // Fake mailbox: seq-ordered history events + a cursor + a dedup set.
  const events: Array<{ seq: number; messageId: string; fileName: string }> = [];
  const seen = new Set<string>();
  let snapCursor = 0;
  let fired = false;
  const state: FakeState = {
    labelCreated: false,
    labelDeleted: false,
    messageTrashed: false,
    workflowCleaned: false,
    dedupCleaned: false,
    polls: 0,
  };

  function seedEvent(fileName = ""): { messageId: string } {
    if (opts.throwOnChange) throw new Error("change boom");
    const messageId = `msg-${events.length + 1}`;
    events.push({ seq: events.length + 1, messageId, fileName });
    return { messageId };
  }

  const deps: GmailPollingSmokeDeps = {
    mintMarker: () => MARKER,
    async prepareLabel() {
      state.labelCreated = true;
      return { labelId: LABEL_ID, labelName: `${MARKER}-label` };
    },
    async createActiveSmokeWorkflow() {
      return { workflowId: "wf-test" };
    },
    async armPollingTrigger() {
      return {
        snapshotHistoryId:
          opts.armedHistoryId === undefined ? "hist-100" : opts.armedHistoryId,
      };
    },
    async poll() {
      state.polls += 1;
      for (const ev of events) {
        if (ev.seq <= snapCursor) continue;
        const key = spec.dedupKey(ev.messageId);
        if (seen.has(key) && !opts.dedupBroken) continue;
        seen.add(key);
        if (opts.suppressRun) continue;
        runs.push({
          runId: `run-${runs.length + 1}`,
          status: "queued",
          triggerPayload: opts.corruptPayload
            ? { id: "someone-elses-message", subject: "unrelated" }
            : payloadFor(spec, ev.messageId, ev.fileName),
          eventId: spec.dedupKey(ev.messageId),
          eventType: spec.eventType,
        });
      }
      // Advance the cursor to head (the real poll persists advanceCheckpoint).
      snapCursor = events.length;
      // Watermark corruption: an advanced-cursor poll AFTER the first fire
      // still pushes a duplicate run (models a broken checkpoint persist).
      if (opts.watermarkBroken && fired) {
        runs.push({
          runId: `run-${runs.length + 1}`,
          status: "queued",
          triggerPayload: payloadFor(spec, "msg-dup", ""),
          eventId: `${spec.dedupKey("msg-dup")}`,
          eventType: spec.eventType,
        });
      }
      if (runs.length > 0) fired = true;
    },
    async readSnapshotHistoryId() {
      return String(snapCursor);
    },
    async rewindSnapshot({ historyId }) {
      snapCursor = Number.parseInt(historyId, 10);
    },
    async sendMarkedEmail() {
      return seedEvent();
    },
    async applyLabel() {
      /* labelsAdded is modeled by the seeded event itself */
    },
    async sendMarkedAttachmentEmail(markerPrefix) {
      const fileName = `${markerPrefix}attach.txt`;
      const { messageId } = seedEvent(fileName);
      return { messageId, fileName };
    },
    async listRuns() {
      return runs.map((r) => ({ ...r }));
    },
    async drainRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      if (run) {
        (run as { status: GmailPollingRun["status"] }).status =
          opts.drainStatus === undefined ? "succeeded" : opts.drainStatus;
      }
    },
    async readRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      return run ? { ...run } : null;
    },
    async cleanupWorkflow() {
      state.workflowCleaned = true;
    },
    async trashMessage() {
      state.messageTrashed = true;
    },
    async deleteLabel() {
      state.labelDeleted = true;
    },
    async cleanupDedup() {
      state.dedupCleaned = true;
    },
    async sleep() {
      /* no-op */
    },
  };
  return { deps, state };
}

describe("runGmailPollingSmoke — happy path (all specs)", () => {
  it.each(ALL_GMAIL_POLLING_SPECS.map((s) => [s.label, s] as const))(
    "%s passes: arm → baseline 0 → change → 1 run identified → succeeded → watermark holds → rewound dedup holds → cleaned",
    async (_label, spec) => {
      const { deps, state } = makeFakeDeps(spec);
      const r = await runGmailPollingSmoke(deps, spec, FAST);

      expect(r.outcome).toBe("pass");
      expect(r.triggerLabel).toBe(spec.label);
      expect(r.armedHistoryId).toBe("hist-100");
      expect(r.baselineRunCount).toBe(0);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.afterWatermarkRunCount).toBe(1);
      expect(r.watermarkProven).toBe(true);
      expect(r.afterRewindRunCount).toBe(1);
      expect(r.dedupProven).toBe(true);
      expect(r.cleaned).toBe(true);
      // baseline + change-detection + watermark + rewound-dedup = 4 polls.
      expect(state.polls).toBe(4);
      expect(state.messageTrashed).toBe(true);
      expect(state.workflowCleaned).toBe(true);
      expect(state.dedupCleaned).toBe(true);
      expect(state.labelCreated).toBe(spec.needsLabel);
      expect(state.labelDeleted).toBe(spec.needsLabel);
    },
  );
});

describe("runGmailPollingSmoke — failure branches (new_email as vehicle)", () => {
  const spec = GMAIL_NEW_EMAIL_SPEC;

  it("fails when activation did not seed a snapshot cursor", async () => {
    const { deps } = makeFakeDeps(spec, { armedHistoryId: null });
    const r = await runGmailPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/snapshot\.historyId/);
    expect(r.cleaned).toBe(true);
  });

  it("fails on baseline violation", async () => {
    const { deps } = makeFakeDeps(spec, { preexistingRuns: 1 });
    const r = await runGmailPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline/);
    expect(r.baselineRunCount).toBe(1);
    expect(r.cleaned).toBe(true);
  });

  it("fails when no run appears after the change", async () => {
    const { deps } = makeFakeDeps(spec, { suppressRun: true });
    const r = await runGmailPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/exactly 1 run/);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run does not identify the seeded message", async () => {
    const { deps } = makeFakeDeps(spec, { corruptPayload: true });
    const r = await runGmailPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify/);
    expect(r.identityMatched).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the drained run is not terminal 'succeeded'", async () => {
    const { deps } = makeFakeDeps(spec, { drainStatus: "failed" });
    const r = await runGmailPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.terminalStatus).toBe("failed");
    expect(r.identityMatched).toBe(true);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the watermark does not hold (advanced-cursor poll re-fires)", async () => {
    const { deps } = makeFakeDeps(spec, { watermarkBroken: true });
    const r = await runGmailPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/watermark/);
    expect(r.watermarkProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when dedup does not hold on the rewound-cursor poll", async () => {
    const { deps } = makeFakeDeps(spec, { dedupBroken: true });
    const r = await runGmailPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/dedup/);
    expect(r.afterRewindRunCount).toBe(2);
    expect(r.dedupProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("still cleans up when the change throws (label + workflow released)", async () => {
    const labeled = GMAIL_NEW_LABELED_EMAIL_SPEC;
    const { deps, state } = makeFakeDeps(labeled, { throwOnChange: true });
    const r = await runGmailPollingSmoke(deps, labeled, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/change boom/);
    expect(state.labelCreated).toBe(true);
    expect(state.labelDeleted).toBe(true);
    expect(state.workflowCleaned).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});

describe("Gmail polling specs — pure parts", () => {
  it("new_email workflow pins the deterministic subject filter (exact match, no label constraint)", () => {
    const wf = GMAIL_NEW_EMAIL_SPEC.buildWorkflow(CTX_PLAIN);
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.config).toEqual({
      subject: MARKER,
      subjectExactMatch: true,
      labelIds: [],
    });
  });

  it("new_labeled_email workflow carries the required labelId and throws without one", () => {
    const wf = GMAIL_NEW_LABELED_EMAIL_SPEC.buildWorkflow(CTX_LABELED);
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.config).toEqual({ labelId: LABEL_ID });
    expect(() => GMAIL_NEW_LABELED_EMAIL_SPEC.buildWorkflow(CTX_PLAIN)).toThrow(/labelId/);
  });

  it("new_attachment workflow config is empty (no filters registered on the trigger)", () => {
    const wf = GMAIL_NEW_ATTACHMENT_SPEC.buildWorkflow(CTX_PLAIN);
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.config).toEqual({});
  });

  it("dedup keys use the per-trigger prefixes so one message can fire all three triggers", () => {
    expect(GMAIL_NEW_EMAIL_SPEC.dedupKey("m1")).toBe("m1");
    expect(GMAIL_NEW_LABELED_EMAIL_SPEC.dedupKey("m1")).toBe("labeled:m1");
    expect(GMAIL_NEW_ATTACHMENT_SPEC.dedupKey("m1")).toBe("attachment:m1");
  });

  it("new_email identity requires the marker subject and the bare message-id eventId", () => {
    const change = { messageId: "m1", identity: MARKER };
    const good: GmailPollingRun = {
      runId: "r", status: "queued",
      triggerPayload: { id: "m1", subject: MARKER },
      eventId: "m1", eventType: "new_email",
    };
    expect(GMAIL_NEW_EMAIL_SPEC.identityMatches(good, CTX_PLAIN, change)).toBe(true);
    // Marker lost → reject.
    expect(
      GMAIL_NEW_EMAIL_SPEC.identityMatches(
        { ...good, triggerPayload: { id: "m1", subject: "other" } },
        CTX_PLAIN,
        change,
      ),
    ).toBe(false);
    // A labeled-prefixed eventId must NOT satisfy new_email.
    expect(
      GMAIL_NEW_EMAIL_SPEC.identityMatches({ ...good, eventId: "labeled:m1" }, CTX_PLAIN, change),
    ).toBe(false);
  });

  it("new_labeled_email identity requires labelAppliedId + labelsAdded + the labeled: eventId", () => {
    const change = { messageId: "m1", identity: "x" };
    const good: GmailPollingRun = {
      runId: "r", status: "queued",
      triggerPayload: {
        id: "m1", subject: MARKER, labelAppliedId: LABEL_ID, labelsAdded: [LABEL_ID],
      },
      eventId: "labeled:m1", eventType: "new_labeled_email",
    };
    expect(GMAIL_NEW_LABELED_EMAIL_SPEC.identityMatches(good, CTX_LABELED, change)).toBe(true);
    // Wrong applied label → reject.
    expect(
      GMAIL_NEW_LABELED_EMAIL_SPEC.identityMatches(
        {
          ...good,
          triggerPayload: { ...good.triggerPayload!, labelAppliedId: "Label_other" },
        },
        CTX_LABELED,
        change,
      ),
    ).toBe(false);
    // Our label missing from labelsAdded → reject.
    expect(
      GMAIL_NEW_LABELED_EMAIL_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, labelsAdded: ["Label_other"] } },
        CTX_LABELED,
        change,
      ),
    ).toBe(false);
  });

  it("new_attachment identity requires a marker-bearing attachment filename", () => {
    const change = { messageId: "m1", identity: `${MARKER}-attach.txt` };
    const good: GmailPollingRun = {
      runId: "r", status: "queued",
      triggerPayload: {
        id: "m1",
        attachments: [{ filename: `${MARKER}-attach.txt` }],
        attachmentCount: 1,
      },
      eventId: "attachment:m1", eventType: "new_attachment",
    };
    expect(GMAIL_NEW_ATTACHMENT_SPEC.identityMatches(good, CTX_PLAIN, change)).toBe(true);
    // No attachments → reject.
    expect(
      GMAIL_NEW_ATTACHMENT_SPEC.identityMatches(
        { ...good, triggerPayload: { id: "m1", attachments: [] } },
        CTX_PLAIN,
        change,
      ),
    ).toBe(false);
    // Unmarked filename → reject.
    expect(
      GMAIL_NEW_ATTACHMENT_SPEC.identityMatches(
        { ...good, triggerPayload: { id: "m1", attachments: [{ filename: "other.txt" }] } },
        CTX_PLAIN,
        change,
      ),
    ).toBe(false);
  });

  it("spec inventory covers exactly the three registered Gmail polling triggers", () => {
    expect(ALL_GMAIL_POLLING_SPECS.map((s) => s.label)).toEqual([
      "gmail:new_email",
      "gmail:new_labeled_email",
      "gmail:new_attachment",
    ]);
  });
});
