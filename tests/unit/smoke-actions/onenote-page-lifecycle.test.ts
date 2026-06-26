/**
 * @jest-environment node
 *
 * Write smoke harness — Microsoft OneNote page lifecycle (SMOKE-WRITE-32).
 *
 * Pins create_page / update_page / delete_page WITHOUT a real DB/provider, driving each
 * through the pure `runWriteSmoke` orchestrator over a FAKE boundary. The smoke-owned
 * resource is the PAGE (created + hard-deleted); the section is a borrowed smoke-named
 * container. Protects:
 *   - create_page: verified by an INDEPENDENT get_page_content read-back (marker on the
 *     persisted title), then delete_page HARD-deletes it -> cleaned, leaked 0;
 *   - update_page: appends to the page body, verified by get_page_content (marker+suffix
 *     "updated" on the rendered content — the seeded body lacks "updated", so a no-op
 *     fails), then delete_page;
 *   - delete_page: executeIsCleanup; absence verified via the smoke page_metadata probe
 *     (exists==false) — never the handler's success echo;
 *   - the section target gates with BLOCKED_ENV when unset (never a write into a real
 *     notebook).
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
const PAGE_ID = "page-1";
// The discovered section + notebook ids must resolve, else BLOCKED_ENV.
const env = (n: string) =>
  n === "SMOKE_ONENOTE_SECTION_ID" ? "sec-smoke" : n === "SMOKE_ONENOTE_NOTEBOOK_ID" ? "nb-smoke" : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown>; via: "engine" | "smoke" }[];
}

function depsWith(
  plan: Record<string, StepRunOutcome>,
  smokePlan: Record<string, StepRunOutcome> = {},
): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ ...input, config: { ...input.config }, via: "engine" });
      return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      calls.push({ ...input, config: { ...input.config }, via: "smoke" });
      return smokePlan[`${input.provider}:${input.action}`] ?? { ok: false, output: null, reason: "no reader" };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("onenote page lifecycle: shape", () => {
  const KEYS = ["microsoft-onenote:create_page", "microsoft-onenote:update_page", "microsoft-onenote:delete_page"] as const;

  it.each(KEYS)("%s is a destructiveSafe fixture gated on a discovered smoke section", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.requiredEnv).toEqual([
      "SMOKE_MICROSOFT_ONENOTE_CONNECTED",
      "SMOKE_ONENOTE_SECTION_ID",
      "SMOKE_ONENOTE_NOTEBOOK_ID",
    ]);
  });

  it("create_page verifies title via get_page_content, cleans via delete_page (hard delete)", () => {
    const f = fixtureFor("microsoft-onenote:create_page");
    expect(f.risk).toBe("write");
    expect(f.config.sectionId).toBe("{{env.SMOKE_ONENOTE_SECTION_ID}}");
    // notebookId cascade parent present for the readiness gate (handler ignores it).
    expect(f.config.notebookId).toBe("{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}");
    expect(f.writeHarness?.verify?.action).toBe("get_page_content");
    expect(f.writeHarness?.verify?.markerPath).toBe("title");
    expect(f.writeHarness?.verify?.smokeRead).toBeUndefined();
    expect(f.writeHarness?.cleanup?.action).toBe("delete_page");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
  });

  it("update_page seeds a page, appends, and proves the append on content (suffix 'updated')", () => {
    const f = fixtureFor("microsoft-onenote:update_page");
    expect(f.config.updateMode).toBe("append");
    expect(f.writeHarness?.setup?.[0]?.action).toBe("create_page");
    expect(f.writeHarness?.verify?.markerPath).toBe("content");
    expect(f.writeHarness?.verify?.markerSuffix).toBe("updated");
  });

  it("delete_page is executeIsCleanup, verified by the smoke page_metadata absence probe", () => {
    const f = fixtureFor("microsoft-onenote:delete_page");
    expect(f.risk).toBe("destructive");
    expect(f.writeHarness?.setup?.[0]?.action).toBe("create_page");
    expect(f.writeHarness?.executeIsCleanup).toBe(true);
    expect(f.writeHarness?.verify?.smokeRead).toBe(true);
    expect(f.writeHarness?.verify?.action).toBe("page_metadata");
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "exists", value: false });
  });
});

// ─── create_page ──────────────────────────────────────────────────────────────

describe("microsoft-onenote:create_page orchestration", () => {
  it("PASS: create -> independent get_page_content title marker -> delete_page (cleaned)", async () => {
    const deps = depsWith({
      "microsoft-onenote:create_page": { ok: true, output: { id: PAGE_ID, title: `${MARKER}page` }, reason: null },
      "microsoft-onenote:get_page_content": { ok: true, output: { title: `${MARKER}page`, content: "<p>x</p>" }, reason: null },
      "microsoft-onenote:delete_page": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onenote:create_page"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    // create targeted the discovered section; delete targeted the captured page id.
    expect(deps.calls.find((c) => c.action === "create_page")?.config.sectionId).toBe("sec-smoke");
    expect(deps.calls.find((c) => c.action === "delete_page")?.config.pageId).toBe(PAGE_ID);
  });

  it("VERIFY_FAILED: read-back title lacks the marker (cleanup still runs)", async () => {
    const deps = depsWith({
      "microsoft-onenote:create_page": { ok: true, output: { id: PAGE_ID, title: "x" }, reason: null },
      "microsoft-onenote:get_page_content": { ok: true, output: { title: "someone-else" }, reason: null },
      "microsoft-onenote:delete_page": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onenote:create_page"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_page")).toBe(true);
  });

  it("BLOCKED_ENV when no smoke section was discovered (never writes into a real notebook)", async () => {
    const deps = depsWith({});
    const res = await runWriteSmoke(fixtureFor("microsoft-onenote:create_page"), { ...RUN, envLookup: () => undefined }, deps);
    expect(res.status).toBe("BLOCKED_ENV");
    expect(res.reason).toMatch(/SMOKE_ONENOTE_SECTION_ID/);
    expect(deps.calls).toHaveLength(0);
  });
});

// ─── update_page ────────────────────────────────────────────────────────────

describe("microsoft-onenote:update_page orchestration", () => {
  it("PASS: seed page -> append -> get_page_content content marker+'updated' -> delete (cleaned)", async () => {
    const deps = depsWith({
      "microsoft-onenote:create_page": { ok: true, output: { id: PAGE_ID, title: `${MARKER}page` }, reason: null },
      "microsoft-onenote:update_page": { ok: true, output: { success: true }, reason: null },
      "microsoft-onenote:get_page_content": { ok: true, output: { content: `<p>${MARKER}body</p><p>${MARKER}updated</p>` }, reason: null },
      "microsoft-onenote:delete_page": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onenote:update_page"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
  });

  it("VERIFY_FAILED: content lacks the 'updated' suffix (append did not land)", async () => {
    const deps = depsWith({
      "microsoft-onenote:create_page": { ok: true, output: { id: PAGE_ID, title: `${MARKER}page` }, reason: null },
      "microsoft-onenote:update_page": { ok: true, output: { success: true }, reason: null },
      "microsoft-onenote:get_page_content": { ok: true, output: { content: `<p>${MARKER}body</p>` }, reason: null },
      "microsoft-onenote:delete_page": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("microsoft-onenote:update_page"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_page")).toBe(true);
  });
});

// ─── delete_page ────────────────────────────────────────────────────────────

describe("microsoft-onenote:delete_page orchestration", () => {
  it("PASS: seed -> delete (execute) -> independent page_metadata exists==false (cleaned)", async () => {
    const deps = depsWith(
      {
        "microsoft-onenote:create_page": { ok: true, output: { id: PAGE_ID, title: `${MARKER}page` }, reason: null },
        "microsoft-onenote:delete_page": { ok: true, output: { success: true }, reason: null },
      },
      { "microsoft-onenote:page_metadata": { ok: true, output: { exists: false }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("microsoft-onenote:delete_page"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    // absence proven via the smoke reader, never an engine action.
    expect(deps.calls.filter((c) => c.action === "page_metadata" && c.via === "smoke")).toHaveLength(1);
  });

  it("VERIFY_FAILED: the page still exists on read-back (delete echo cannot vacuously pass)", async () => {
    const deps = depsWith(
      {
        "microsoft-onenote:create_page": { ok: true, output: { id: PAGE_ID, title: `${MARKER}page` }, reason: null },
        "microsoft-onenote:delete_page": { ok: true, output: { success: true }, reason: null },
      },
      { "microsoft-onenote:page_metadata": { ok: true, output: { exists: true }, reason: null } },
    );
    const res = await runWriteSmoke(fixtureFor("microsoft-onenote:delete_page"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });
});
