/**
 * @jest-environment node
 *
 * Write smoke harness — Mailchimp subscriber lifecycle batch (add_subscriber,
 * update_subscriber, unsubscribe_subscriber, add_tag, remove_tag,
 * remove_subscriber).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a
 * FAKE boundary. Protects the contracts that matter:
 *   - every non-delete fixture cleans via remove_subscriber
 *     delete_permanent (REQUIRED delete-kind cleanup -> cleaned==created,
 *     leaked 0; CLEANUP_FAILED on failure);
 *   - verifies run through the REGISTERED get_subscriber read (GET by hash),
 *     asserting persisted state (status / mergeFields suffix / tags
 *     contains+absent), never the write echoes;
 *   - remove_subscriber is executeIsCleanup, proven by the member_state seam
 *     exists==false (an errored read is VERIFY_FAILED, never "deleted");
 *   - the Q11 gates ride EXPLICIT values (status "subscribed", mode
 *     "delete_permanent") in fixture config;
 *   - all gate BLOCKED_ENV without the discovered audience + role email.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const AUD = "aud-1";
const EMAILS: Record<string, string> = {
  SMOKE_MAILCHIMP_SUB_EMAIL_ADD: `owner+${MARKER}add@mail.test`,
  SMOKE_MAILCHIMP_SUB_EMAIL_UPDATE: `owner+${MARKER}upd@mail.test`,
  SMOKE_MAILCHIMP_SUB_EMAIL_UNSUB: `owner+${MARKER}uns@mail.test`,
  SMOKE_MAILCHIMP_SUB_EMAIL_TAGADD: `owner+${MARKER}tga@mail.test`,
  SMOKE_MAILCHIMP_SUB_EMAIL_TAGREMOVE: `owner+${MARKER}tgr@mail.test`,
  SMOKE_MAILCHIMP_SUB_EMAIL_REMOVE: `owner+${MARKER}rem@mail.test`,
};

const env = (n: string): string | undefined =>
  n === "SMOKE_MAILCHIMP_AUDIENCE_ID" ? AUD : EMAILS[n];

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

/**
 * Fake boundary: the engine echoes stored state per action; `readBack` is what
 * get_subscriber returns; `memberExists` is what the member_state seam reports.
 */
function depsWith(
  readBack: Record<string, unknown>,
  opts: { memberExists?: boolean; cleanupFails?: boolean; stateError?: string } = {},
): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "add_subscriber":
          return {
            ok: true,
            output: {
              subscriberId: "m-1",
              email: input.config.email,
              status: input.config.status,
              listId: input.config.audience_id,
            },
            reason: null,
          };
        case "update_subscriber":
          return { ok: true, output: { subscriberId: "m-1", email: input.config.email }, reason: null };
        case "unsubscribe_subscriber":
          return {
            ok: true,
            output: { listId: input.config.listId, emailAddress: input.config.emailAddress, status: "unsubscribed", unsubscribed: true },
            reason: null,
          };
        case "add_tag":
          return { ok: true, output: { email: input.config.email, addedTags: input.config.tags }, reason: null };
        case "remove_tag":
          return { ok: true, output: { email: input.config.email, removedTags: input.config.tags }, reason: null };
        case "remove_subscriber":
          return opts.cleanupFails
            ? { ok: false, output: null, reason: "delete failed" }
            : { ok: true, output: { email: input.config.email, mode: input.config.mode, removed: true }, reason: null };
        case "get_subscriber":
          return { ok: true, output: { ...readBack }, reason: null };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (opts.stateError) return { ok: false, output: null, reason: opts.stateError };
      if (input.action === "member_state") {
        return { ok: true, output: { exists: opts.memberExists ?? false, status: null }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("mailchimp subscriber batch — shape", () => {
  const CLEANED_KEYS = [
    "mailchimp:add_subscriber",
    "mailchimp:update_subscriber",
    "mailchimp:unsubscribe_subscriber",
    "mailchimp:add_tag",
    "mailchimp:remove_tag",
  ] as const;

  it("non-delete fixtures are writeSafe writes cleaned by remove_subscriber delete_permanent", () => {
    for (const key of CLEANED_KEYS) {
      const f = fixtureFor(key);
      expect(f).toBeDefined();
      expect(f.risk).toBe("write");
      expect(f.liveRisk).toBe("write");
      expect(f.liveSafe).toBe(false);
      expect(f.writeHarness?.liveClass).toBe("writeSafe");
      expect(f.writeHarness?.cleanup?.action).toBe("remove_subscriber");
      expect(f.writeHarness?.cleanup?.config.mode).toBe("delete_permanent");
      expect(f.writeHarness?.cleanup?.config.email).toBe("{{ledger.member.id}}");
      expect(f.writeHarness?.cleanupKind).toBe("delete");
      // Verify goes through the REGISTERED get_subscriber read, not a seam.
      expect(f.writeHarness?.verify?.action).toBe("get_subscriber");
      expect(f.writeHarness?.verify?.smokeRead).toBeUndefined();
    }
  });

  it("remove_subscriber is a destructive executeIsCleanup fixture proving exists==false", () => {
    const f = fixtureFor("mailchimp:remove_subscriber");
    expect(f.risk).toBe("destructive");
    expect(f.liveRisk).toBe("destructive");
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.writeHarness?.executeIsCleanup).toBe(true);
    expect(f.writeHarness?.cleanup).toBeUndefined();
    expect(f.config.mode).toBe("delete_permanent");
    expect(f.writeHarness?.verify?.smokeRead).toBe(true);
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "exists", value: false });
  });

  it("Q11 gates are explicit: consent status on every seed, mode on the delete", () => {
    expect(fixtureFor("mailchimp:add_subscriber").config.status).toBe("subscribed");
    for (const key of CLEANED_KEYS.slice(1)) {
      const setup = fixtureFor(key).writeHarness?.setup?.[0];
      expect(setup?.action).toBe("add_subscriber");
      expect(setup?.config.status).toBe("subscribed");
    }
  });
});

// ─── add / update / unsubscribe ──────────────────────────────────────────────

describe("mailchimp:add_subscriber", () => {
  it("adds a plus-addressed marker member, verifies status, then permanently deletes it", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_ADD!;
    const deps = depsWith({ email, status: "subscribed", mergeFields: {}, tags: [] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:add_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(1);
    expect(r.ledger.cleaned).toBe(1);
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_subscriber",
      "get_subscriber",
      "remove_subscriber",
    ]);
    const add = deps.calls.find((c) => c.action === "add_subscriber")!;
    expect(add.config.audience_id).toBe(AUD);
    expect(add.config.email).toBe(email);
    expect(add.config.status).toBe("subscribed");
    expect(deps.calls.find((c) => c.action === "remove_subscriber")!.config.email).toBe(email);
  });

  it("is VERIFY_FAILED when the read-back status is not subscribed (cleanup still deletes)", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_ADD!;
    const deps = depsWith({ email, status: "pending", mergeFields: {}, tags: [] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:add_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "remove_subscriber")).toBe(true);
  });

  it("is CLEANUP_FAILED when the required permanent delete fails", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_ADD!;
    const deps = depsWith({ email, status: "subscribed", mergeFields: {}, tags: [] }, { cleanupFails: true });
    const r = await runWriteSmoke(fixtureFor("mailchimp:add_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("CLEANUP_FAILED");
    expect(r.ledger.leaked).toBe(1);
  });

  it("is BLOCKED_ENV (never a write) when audience/email discovery is missing", async () => {
    const deps = depsWith({});
    const r = await runWriteSmoke(fixtureFor("mailchimp:add_subscriber"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(r.reason).toMatch(/SMOKE_MAILCHIMP/);
    expect(deps.calls).toHaveLength(0);
  });
});

describe("mailchimp:update_subscriber", () => {
  it("seeds, PATCHes first_name, proves the SPECIFIC updated merge value (suffix), then deletes", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_UPDATE!;
    const deps = depsWith({ email, status: "subscribed", mergeFields: { FNAME: `${MARKER}updated` }, tags: [] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:update_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_subscriber",
      "update_subscriber",
      "get_subscriber",
      "remove_subscriber",
    ]);
    const update = deps.calls.find((c) => c.action === "update_subscriber")!;
    expect(update.config.email).toBe(email);
    expect(update.config.first_name).toBe(`${MARKER}updated`);
  });

  it("is VERIFY_FAILED when the read-back still shows the SEED merge value", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_UPDATE!;
    const deps = depsWith({ email, status: "subscribed", mergeFields: { FNAME: `${MARKER}seed` }, tags: [] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:update_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

describe("mailchimp:unsubscribe_subscriber", () => {
  it("seeds SUBSCRIBED, unsubscribes, proves persisted status unsubscribed, then deletes", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_UNSUB!;
    const deps = depsWith({ email, status: "unsubscribed", mergeFields: {}, tags: [] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:unsubscribe_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_subscriber",
      "unsubscribe_subscriber",
      "get_subscriber",
      "remove_subscriber",
    ]);
    const unsub = deps.calls.find((c) => c.action === "unsubscribe_subscriber")!;
    expect(unsub.config.listId).toBe(AUD);
    expect(unsub.config.emailAddress).toBe(email);
  });

  it("is VERIFY_FAILED when the persisted status is still subscribed (no-op unsubscribe)", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_UNSUB!;
    const deps = depsWith({ email, status: "subscribed", mergeFields: {}, tags: [] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:unsubscribe_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

// ─── tags ─────────────────────────────────────────────────────────────────────

describe("mailchimp:add_tag", () => {
  it("seeds, stamps the marker tag, proves membership via tags contains, then deletes", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_TAGADD!;
    const deps = depsWith({ email, status: "subscribed", mergeFields: {}, tags: [`${MARKER}tag`] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:add_tag"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_subscriber",
      "add_tag",
      "get_subscriber",
      "remove_subscriber",
    ]);
    expect(deps.calls.find((c) => c.action === "add_tag")!.config.tags).toEqual([`${MARKER}tag`]);
  });

  it("is VERIFY_FAILED when the persisted tags do NOT contain the marker tag", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_TAGADD!;
    const deps = depsWith({ email, status: "subscribed", mergeFields: {}, tags: ["unrelated"] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:add_tag"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

describe("mailchimp:remove_tag", () => {
  it("seeds member + tag, strips it, proves ABSENCE via read-back, then deletes", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_TAGREMOVE!;
    const deps = depsWith({ email, status: "subscribed", mergeFields: {}, tags: ["unrelated"] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:remove_tag"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_subscriber",
      "add_tag",
      "remove_tag",
      "get_subscriber",
      "remove_subscriber",
    ]);
  });

  it("is VERIFY_FAILED when the marker tag is STILL present on the read-back", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_TAGREMOVE!;
    const deps = depsWith({ email, status: "subscribed", mergeFields: {}, tags: [`${MARKER}tag`] });
    const r = await runWriteSmoke(fixtureFor("mailchimp:remove_tag"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});

// ─── remove_subscriber ───────────────────────────────────────────────────────

describe("mailchimp:remove_subscriber", () => {
  it("seeds, permanently deletes, and proves absence via member_state exists==false", async () => {
    const email = EMAILS.SMOKE_MAILCHIMP_SUB_EMAIL_REMOVE!;
    const deps = depsWith({}, { memberExists: false });
    const r = await runWriteSmoke(fixtureFor("mailchimp:remove_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.created).toBe(1);
    expect(r.ledger.cleaned).toBe(1);
    expect(r.ledger.leaked).toBe(0);
    expect(deps.calls.map((c) => c.action)).toEqual([
      "add_subscriber",
      "remove_subscriber",
      "member_state",
    ]);
    const remove = deps.calls.find((c) => c.action === "remove_subscriber")!;
    expect(remove.config.email).toBe(email);
    expect(remove.config.mode).toBe("delete_permanent");
  });

  it("is VERIFY_FAILED when the read-back says the member still EXISTS", async () => {
    const deps = depsWith({}, { memberExists: true });
    const r = await runWriteSmoke(fixtureFor("mailchimp:remove_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is VERIFY_FAILED (never a false deleted) when the member_state read errors", async () => {
    const deps = depsWith({}, { stateError: "provider read failed" });
    const r = await runWriteSmoke(fixtureFor("mailchimp:remove_subscriber"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("is BLOCKED_ENV (never a seed create) when discovery is missing", async () => {
    const deps = depsWith({});
    const r = await runWriteSmoke(fixtureFor("mailchimp:remove_subscriber"), { ...RUN, envLookup: () => undefined }, deps);
    expect(r.status).toBe("BLOCKED_ENV");
    expect(deps.calls).toHaveLength(0);
  });
});
