/**
 * @jest-environment node
 *
 * Write smoke harness — Gmail state-change + delete lifecycle (mark_as_read /
 * mark_as_unread / archive_email / delete_email).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE boundary
 * (mock only the external seam; run the real gate / ledger / phase / verify logic).
 * Protects the contracts that matter:
 *   - mark_as_unread: create draft -> add UNREAD -> message_labels proves UNREAD present;
 *   - mark_as_read: create draft + add UNREAD (setup) -> remove -> proves UNREAD gone;
 *   - archive_email: create draft + add INBOX (setup) -> remove -> proves INBOX gone;
 *   - delete_email: create draft -> trash (executeIsCleanup) -> proves labelIds has TRASH;
 *   - a wrong read-back is VERIFY_FAILED (no vacuous pass);
 *   - the self-address env gates with BLOCKED_ENV (never a mutation) when unset.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import { runWriteSmoke, type WriteHarnessDeps } from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MSG_ID = "M1234567";
const SELF = "smoke@example.com";

const env = (n: string): string | undefined =>
  n === "SMOKE_GMAIL_CONNECTED" ? "1" : n === "SMOKE_GMAIL_SELF" ? SELF : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(readBackLabelIds: string[]): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "create_draft") {
        return { ok: true, output: { draftId: "r-1", messageId: MSG_ID, threadId: "t-1" }, reason: null };
      }
      return { ok: true, output: { messageId: MSG_ID, labelIds: readBackLabelIds }, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "message_labels") {
        return { ok: true, output: { found: true, labelIds: readBackLabelIds, subject: "" }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

describe("gmail:mark_as_unread", () => {
  it("adds UNREAD, proves it, then trashes the draft (cleaned)", async () => {
    const deps = depsWith(["DRAFT", "UNREAD"]);
    const r = await runWriteSmoke(fixtureFor("gmail:mark_as_unread"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(deps.calls.map((c) => c.action)).toEqual(["create_draft", "mark_as_unread", "message_labels", "delete_email"]);
  });

  it("is VERIFY_FAILED when UNREAD is not present on read-back", async () => {
    const deps = depsWith(["DRAFT"]);
    const r = await runWriteSmoke(fixtureFor("gmail:mark_as_unread"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never a mutation) when the self address is unset", async () => {
    const deps = depsWith(["DRAFT", "UNREAD"]);
    const noSelf = (n: string) => (n === "SMOKE_GMAIL_SELF" ? undefined : env(n));
    const r = await runWriteSmoke(fixtureFor("gmail:mark_as_unread"), { ...RUN, envLookup: noSelf }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});

describe("gmail:mark_as_read", () => {
  it("adds UNREAD in setup, removes it, proves it is gone, then trashes (cleaned)", async () => {
    const deps = depsWith(["DRAFT"]); // after mark_as_read, UNREAD is gone
    const r = await runWriteSmoke(fixtureFor("gmail:mark_as_read"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(deps.calls.map((c) => c.action)).toEqual(["create_draft", "mark_as_unread", "mark_as_read", "message_labels", "delete_email"]);
  });

  it("is VERIFY_FAILED when UNREAD still present after mark_as_read", async () => {
    const deps = depsWith(["DRAFT", "UNREAD"]);
    const r = await runWriteSmoke(fixtureFor("gmail:mark_as_read"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

describe("gmail:archive_email", () => {
  it("adds INBOX in setup, removes it, proves it is gone, then trashes (cleaned)", async () => {
    const deps = depsWith(["DRAFT"]); // after archive, INBOX is gone
    const r = await runWriteSmoke(fixtureFor("gmail:archive_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(deps.calls.map((c) => c.action)).toEqual(["create_draft", "add_label", "archive_email", "message_labels", "delete_email"]);
    expect(deps.calls.find((c) => c.action === "add_label")!.config.labelIds).toEqual(["INBOX"]);
  });

  it("is VERIFY_FAILED when INBOX still present after archive", async () => {
    const deps = depsWith(["DRAFT", "INBOX"]);
    const r = await runWriteSmoke(fixtureFor("gmail:archive_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

describe("gmail:delete_email", () => {
  it("trashes the draft (executeIsCleanup), proves labelIds has TRASH (cleaned)", async () => {
    const deps = depsWith(["DRAFT", "TRASH"]);
    const r = await runWriteSmoke(fixtureFor("gmail:delete_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(fixtureFor("gmail:delete_email").writeHarness?.executeIsCleanup).toBe(true);
    expect(deps.calls.map((c) => c.action)).toEqual(["create_draft", "delete_email", "message_labels"]);
    expect(deps.calls.find((c) => c.action === "delete_email")!.config.deleteMode).toBe("trash");
  });

  it("is VERIFY_FAILED when the read-back does not show TRASH", async () => {
    const deps = depsWith(["DRAFT"]);
    const r = await runWriteSmoke(fixtureFor("gmail:delete_email"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
