/**
 * @jest-environment node
 *
 * Write smoke harness — Gmail draft + label lifecycle (create_draft / create_label /
 * add_label / remove_label).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (mock only the external seam; run the real gate / ledger / phase / verify logic).
 * Protects the contracts that matter:
 *   - create_draft captures the draft's messageId; an INDEPENDENT message_labels read-back
 *     proves labelIds contains DRAFT + the marker on subject; delete_email(trash) cleans it;
 *   - create_label verifies via list_labels marker; no cleanup (label artifact left);
 *   - add_label / remove_label use a smoke draft + the reversible STARRED label; the
 *     read-back proves labelIds contains / no-longer-contains STARRED; draft trashed;
 *   - a wrong read-back is VERIFY_FAILED (no vacuous pass);
 *   - the self-address env gates with BLOCKED_ENV (never a mutation) when unset.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const MSG_ID = "M1234567";
const LABEL_ID = "Label_99";
const SELF = "smoke@example.com";

const env = (n: string): string | undefined =>
  n === "SMOKE_GMAIL_CONNECTED" ? "1" : n === "SMOKE_GMAIL_SELF" ? SELF : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(readBack: { labelIds: string[]; subject: string }): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "create_draft") {
        return { ok: true, output: { draftId: "r-1", messageId: MSG_ID, threadId: "t-1" }, reason: null };
      }
      if (input.action === "create_label") {
        return { ok: true, output: { labelId: LABEL_ID, name: `${MARKER}label`, type: "user" }, reason: null };
      }
      if (input.action === "list_labels") {
        return { ok: true, output: { labels: [{ id: LABEL_ID, name: `${MARKER}label` }], count: 1 }, reason: null };
      }
      return { ok: true, output: { messageId: MSG_ID, labelIds: readBack.labelIds }, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "message_labels") {
        return { ok: true, output: { found: true, ...readBack }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

describe("gmail:create_draft", () => {
  it("creates a draft, proves DRAFT + marker via message_labels, then trashes it (cleaned)", async () => {
    const deps = depsWith({ labelIds: ["DRAFT"], subject: `${MARKER}draft hi` });
    const r = await runWriteSmoke(fixtureFor("gmail:create_draft"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_draft", "message_labels", "delete_email"]);
    expect(deps.calls.find((c) => c.action === "delete_email")!.config.deleteMode).toBe("trash");
  });

  it("is VERIFY_FAILED when the read-back is not a DRAFT", async () => {
    const deps = depsWith({ labelIds: ["INBOX"], subject: `${MARKER}draft hi` });
    const r = await runWriteSmoke(fixtureFor("gmail:create_draft"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(r.artifact).toBe("cleaned"); // cleanup still trashes the draft
  });

  it("is BLOCKED_ENV (never a create) when the self address is unset", async () => {
    const deps = depsWith({ labelIds: ["DRAFT"], subject: "" });
    const noSelf = (n: string) => (n === "SMOKE_GMAIL_SELF" ? undefined : env(n));
    const r = await runWriteSmoke(fixtureFor("gmail:create_draft"), { ...RUN, envLookup: noSelf }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});

describe("gmail:create_label", () => {
  it("creates a label, proves it via list_labels, leaves a label artifact (no delete)", async () => {
    const deps = depsWith({ labelIds: [], subject: "" });
    const r = await runWriteSmoke(fixtureFor("gmail:create_label"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left"); // no registered Gmail delete-label action
    expect(r.ledger.created).toBe(1);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_label", "list_labels"]);
    expect(fixtureFor("gmail:create_label").writeHarness?.cleanup).toBeUndefined();
  });
});

describe("gmail:add_label", () => {
  it("labels a smoke draft with STARRED, proves it, then trashes the draft", async () => {
    const deps = depsWith({ labelIds: ["DRAFT", "STARRED"], subject: `${MARKER}addlabel` });
    const r = await runWriteSmoke(fixtureFor("gmail:add_label"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_draft",
      "add_label",
      "message_labels",
      "delete_email",
    ]);
    expect(deps.calls.find((c) => c.action === "add_label")!.config.labelIds).toEqual(["STARRED"]);
  });

  it("is VERIFY_FAILED when STARRED is not present on the read-back", async () => {
    const deps = depsWith({ labelIds: ["DRAFT"], subject: "" });
    const r = await runWriteSmoke(fixtureFor("gmail:add_label"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

describe("gmail:remove_label", () => {
  it("adds STARRED in setup, removes it, proves it is gone, then trashes the draft", async () => {
    const deps = depsWith({ labelIds: ["DRAFT"], subject: `${MARKER}removelabel` });
    const r = await runWriteSmoke(fixtureFor("gmail:remove_label"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "create_draft",
      "add_label",
      "remove_label",
      "message_labels",
      "delete_email",
    ]);
  });

  it("is VERIFY_FAILED when STARRED still present after remove", async () => {
    const deps = depsWith({ labelIds: ["DRAFT", "STARRED"], subject: "" });
    const r = await runWriteSmoke(fixtureFor("gmail:remove_label"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
