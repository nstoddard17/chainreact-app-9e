/**
 * @jest-environment node
 *
 * Unit tests for the Dropbox webhook trigger-smoke spec
 * (tests/trigger-smoke/dropboxWebhookSmoke.ts) on the generic direct-seed
 * orchestrator, with injected fakes — PLUS cross-checks of the synthetic
 * notification body against the provider's REAL signature verifier + REAL
 * receive parser, and of the expected run shape against the REAL
 * normalizeNewFile (the same production modules the live route runs).
 * No DB, no routes, no Dropbox.
 */
import { createHmac } from "node:crypto";
import { verifyDropboxSignature } from "@/integrations/_shared/dropbox/webhooks/signature";
import { receiveDropboxWebhook } from "@/integrations/dropbox/triggers/newFile/receive";
import { normalizeNewFile } from "@/integrations/dropbox/triggers/newFile/normalize";
import {
  runDirectSeedWebhookSmoke,
  type DirectSeedSmokeRun,
  type DirectSeedWebhookSmokeDeps,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import {
  buildDropboxNotificationBody,
  DROPBOX_NEW_FILE_SPEC,
  type DropboxSmokeIdentity,
} from "@/tests/trigger-smoke/dropboxWebhookSmoke";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;
const DBID = "dbid:crsmoke-account";

const IDENTITY: DropboxSmokeIdentity = {
  eventId: "crsmoke-newfile-test",
  marker: "crsmoke-newfile-test",
};

/** The run shape the REAL normalizeNewFile produces for the smoke file. */
function firedRun(identity: DropboxSmokeIdentity): DirectSeedSmokeRun {
  const event = normalizeNewFile({
    providerAccountId: DBID,
    entry: {
      ".tag": "file",
      id: "id:crsmoke1",
      name: `${identity.marker}.txt`,
      path_display: `/crsmoke-trigger-${identity.marker}/${identity.marker}.txt`,
      path_lower: `/crsmoke-trigger-${identity.marker}/${identity.marker}.txt`,
      rev: "015f00",
      server_modified: "2026-07-07T00:00:00Z",
    },
  });
  return {
    runId: "run-1",
    status: "queued",
    triggerPayload: event.payload as Record<string, unknown>,
    eventId: event.eventId,
    eventType: event.eventType,
  };
}

function makeFakeDeps(): DirectSeedWebhookSmokeDeps<DropboxSmokeIdentity> {
  const runs: DirectSeedSmokeRun[] = [];
  const seen = new Set<string>();
  return {
    mintIdentity: () => IDENTITY,
    async createActiveSmokeWorkflow() {
      return { workflowId: "wf-test" };
    },
    async seedRegistration() {
      return { seededEventType: "new_file" };
    },
    async deliverSyntheticEvent({ identity }) {
      const fired = firedRun(identity);
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
    async cleanupRegistration() {},
    async cleanupDedup() {},
    async sleep() {},
  };
}

describe("Dropbox spec — fake happy path via the generic orchestrator", () => {
  it("dropbox:new_file passes: seed canonical → baseline 0 → deliver → 1 run identified → succeeded → dedup holds", async () => {
    const r = await runDirectSeedWebhookSmoke(makeFakeDeps(), DROPBOX_NEW_FILE_SPEC, FAST);
    expect(r.outcome).toBe("pass");
    expect(r.seededEventType).toBe("new_file");
    expect(r.identityMatched).toBe(true);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.dedupProven).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});

describe("synthetic notification ↔ REAL production modules", () => {
  it("the signed body verifies + parses through the REAL receiveDropboxWebhook", () => {
    const OLD = process.env.DROPBOX_CLIENT_SECRET;
    process.env.DROPBOX_CLIENT_SECRET = "crsmoke-unit-secret";
    try {
      const rawBody = buildDropboxNotificationBody(DBID);
      const signature = createHmac("sha256", "crsmoke-unit-secret")
        .update(rawBody)
        .digest("hex");
      const result = receiveDropboxWebhook({
        request: new Request("http://localhost/api/webhooks/dropbox", {
          method: "POST",
          headers: { "x-dropbox-signature": signature },
          body: rawBody,
        }),
        rawBody,
      });
      expect(result.accountIds).toEqual([DBID]);
    } finally {
      if (OLD === undefined) delete process.env.DROPBOX_CLIENT_SECRET;
      else process.env.DROPBOX_CLIENT_SECRET = OLD;
    }
  });

  it("tampered body / wrong secret fail the REAL verifier", () => {
    const rawBody = buildDropboxNotificationBody(DBID);
    const secret = "crsmoke-unit-secret";
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    expect(verifyDropboxSignature(rawBody, signature, secret)).toEqual({ valid: true });
    expect(verifyDropboxSignature(`${rawBody} `, signature, secret).valid).toBe(false);
    expect(verifyDropboxSignature(rawBody, signature, "other-secret").valid).toBe(false);
  });

  it("the REAL normalizeNewFile output satisfies identityMatches (and rejects a lost marker)", () => {
    const good = firedRun(IDENTITY);
    expect(good.eventId!.startsWith("new_file:")).toBe(true);
    expect(DROPBOX_NEW_FILE_SPEC.identityMatches(good, IDENTITY)).toBe(true);
    expect(
      DROPBOX_NEW_FILE_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, name: "unrelated.txt" } },
        IDENTITY,
      ),
    ).toBe(false);
    expect(
      DROPBOX_NEW_FILE_SPEC.identityMatches(
        { ...good, eventId: "somethingelse:1" },
        IDENTITY,
      ),
    ).toBe(false);
  });

  it("the trigger payload carries metadata only — no bytes/content/link fields", () => {
    const good = firedRun(IDENTITY);
    const keys = Object.keys(good.triggerPayload!);
    for (const forbidden of ["content", "bytes", "url", "link", "sharedLink", "temporaryLink"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
