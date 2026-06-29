/**
 * @jest-environment node
 *
 * Write smoke harness — Microsoft Outlook create_draft_email (SMOKE-WRITE-43).
 *
 * A draft is NOT a send: create_draft_email creates a smoke-owned draft in the Drafts
 * folder (never delivered), verified independently via certified fetch_emails (unique
 * marker subject), cleaned up by delete_email (permanent). Driven through the pure
 * `runWriteSmoke` orchestrator over a FAKE boundary (no DB / no provider).
 *
 * NOT live-certified — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP. These offline tests pin the fixture shape + orchestration only.
 *
 * Protects:
 *   - the execute action IS the resource creator (draftId captured), no setup;
 *   - verify proves the marker(+suffix "draft") subject on an INDEPENDENT fetch_emails
 *     read of the Drafts folder (a failed create has no such subject);
 *   - cleanup is same-provider delete_email of exactly the captured draft (0 leaked).
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true, sleep: async () => {} } as const;
const MARKER = "crsmoke-T1-";
const DRAFT_ID = "AAMkADraft1";
const env = (): string | undefined => "x"; // _CONNECTED signals are filtered from the target gate

const fixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-outlook:create_draft_email")!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(plan: Record<string, readonly StepRunOutcome[]>): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  const idx: Record<string, number> = {};
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      const key = `${input.provider}:${input.action}`;
      const seq = plan[key] ?? [{ ok: true, output: null, reason: null }];
      const i = idx[key] ?? 0;
      idx[key] = i + 1;
      return seq[Math.min(i, seq.length - 1)]!;
    },
  };
}

const CREATE_OK: StepRunOutcome = { ok: true, output: { draftId: DRAFT_ID, subject: `${MARKER}draft` }, reason: null };
// fetch_emails on the Drafts folder returns the marker-subjected draft (+ unrelated noise).
const DRAFTS_WITH_MARKER: StepRunOutcome = {
  ok: true,
  output: {
    messages: [
      { id: "other", subject: "unrelated draft" },
      { id: DRAFT_ID, subject: `${MARKER}draft` },
    ],
    count: 2,
  },
  reason: null,
};

describe("outlook:create_draft_email — fixture shape", () => {
  it("is a destructiveSafe write that creates a draft, verifies via fetch_emails, cleans via delete_email", () => {
    const f = fixture();
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.requiredEnv).toEqual(["SMOKE_MICROSOFT_OUTLOOK_CONNECTED"]);
    // No setup — the execute action creates + captures the draft.
    expect(f.writeHarness?.setup).toBeUndefined();
    expect(f.writeHarness?.captureResource).toEqual({ resourceKey: "draft", idPath: "draftId", kind: "draft" });
    // The draft is a draft (subject carries the marker; recipient is a reserved .invalid TLD).
    expect(f.config.subject).toBe("{{smokeMarker}}draft");
    expect(String(f.config.to)).toContain(".invalid");
    // verify is an INDEPENDENT fetch_emails read of the Drafts folder, marker + suffix "draft".
    expect(f.writeHarness?.verify?.action).toBe("fetch_emails");
    expect(f.writeHarness?.verify?.config).toMatchObject({ folderId: "drafts" });
    expect(f.writeHarness?.verify?.markerPath).toBe("messages");
    expect(f.writeHarness?.verify?.markerSuffix).toBe("draft");
    // cleanup deletes exactly the captured draft (same provider -> not cross-provider).
    expect(f.writeHarness?.cleanup?.provider).toBe("microsoft-outlook");
    expect(f.writeHarness?.cleanup?.action).toBe("delete_email");
    expect(f.writeHarness?.cleanup?.config).toMatchObject({ emailId: "{{ledger.draft.id}}", deleteMode: "permanent" });
    expect(f.writeHarness?.crossProviderCleanup).toBeUndefined();
  });
});

describe("outlook:create_draft_email — orchestration", () => {
  it("PASS: create draft -> independent fetch_emails marker subject -> delete (cleaned, 0 leaked)", async () => {
    const deps = depsWith({
      "microsoft-outlook:create_draft_email": [CREATE_OK],
      "microsoft-outlook:fetch_emails": [DRAFTS_WITH_MARKER],
      "microsoft-outlook:delete_email": [{ ok: true, output: null, reason: null }],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger).toMatchObject({ created: 1, cleaned: 1, leaked: 0, kinds: ["draft"] });
    // verify read the Drafts folder; cleanup targeted the captured draft id.
    expect(deps.calls.find((c) => c.action === "fetch_emails")?.config.folderId).toBe("drafts");
    expect(deps.calls.find((c) => c.action === "delete_email")?.config.emailId).toBe(DRAFT_ID);
  });

  it("VERIFY_FAILED: the Drafts folder lacks the marker subject (cleanup still runs, 0 leaked)", async () => {
    const deps = depsWith({
      "microsoft-outlook:create_draft_email": [CREATE_OK],
      "microsoft-outlook:fetch_emails": [{ ok: true, output: { messages: [{ id: "x", subject: "someone else" }], count: 1 }, reason: null }],
      "microsoft-outlook:delete_email": [{ ok: true, output: null, reason: null }],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_email")).toBe(true);
    expect(res.ledger.leaked).toBe(0);
  });

  it("CLEANUP_FAILED (not masked) when the draft delete keeps failing", async () => {
    const deps = depsWith({
      "microsoft-outlook:create_draft_email": [CREATE_OK],
      "microsoft-outlook:fetch_emails": [DRAFTS_WITH_MARKER],
      "microsoft-outlook:delete_email": [{ ok: false, output: null, reason: "server error 500" }],
    });
    const res = await runWriteSmoke(fixture(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("CLEANUP_FAILED");
    expect(res.ledger.leaked).toBe(1);
  });
});
