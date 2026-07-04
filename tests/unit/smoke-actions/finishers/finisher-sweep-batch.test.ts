/**
 * @jest-environment node
 *
 * Write smoke harness — small connected-provider finisher sweep (google-docs
 * export_document + share_document, microsoft-onenote create_notebook +
 * create_section, notion create_database, trello create_board + create_list).
 *
 * Drives each fixture through the pure `runWriteSmoke` orchestrator over a FAKE
 * boundary. Protects the contracts that matter:
 *   - export_document stages to v2_storage and verifies via the metadata-only
 *     staged_file seam (file-output contract; NO cleanup because the ledger
 *     holds doc + staged object and a doc-only cleanup would misreport);
 *   - share_document proves the anyone-link via the types/roles-only
 *     file_permissions seam, then cross-provider deletes the doc (CLEANED);
 *   - onenote/notion/trello creates verify via INDEPENDENT reads (registered
 *     list_notebooks / list_sections / query_database, or the member_boards /
 *     board_lists seams) and honestly LEAVE artifacts (no delete paths);
 *   - wrong/absent read-backs are VERIFY_FAILED (no vacuous pass).
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
const PARENT_PAGE = "parent-page-1";
const STAGED_PATH = "u1/w1/r1/n1/crsmoke-T1-export doc.txt";

const env = (n: string): string | undefined =>
  n === "SMOKE_GOOGLE_DOCS_CONNECTED" ||
  n === "SMOKE_MICROSOFT_ONENOTE_CONNECTED" ||
  n === "SMOKE_NOTION_CONNECTED" ||
  n === "SMOKE_TRELLO_CONNECTED"
    ? "true"
    : n === "SMOKE_NOTION_PARENT_PAGE_ID"
      ? PARENT_PAGE
      : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(reads: Record<string, Record<string, unknown>> = {}): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      switch (input.action) {
        case "create_document":
          return { ok: true, output: { documentId: "doc-1", title: input.config.title }, reason: null };
        case "export_document":
          return {
            ok: true,
            output: {
              file: { kind: "v2_storage", name: `${MARKER}export doc.txt`, mimeType: "text/plain", storagePath: STAGED_PATH },
              fileName: `${MARKER}export doc.txt`,
              fileSize: 42,
              format: "txt",
            },
            reason: null,
          };
        case "share_document":
          return { ok: true, output: { documentId: input.config.documentId, isPublic: true, sharedWith: [], errors: [] }, reason: null };
        case "delete_file":
          return { ok: true, output: { deleted: true, fileId: input.config.fileId }, reason: null };
        case "create_notebook":
          return { ok: true, output: { id: "nb-1", displayName: input.config.displayName }, reason: null };
        case "create_section":
          return { ok: true, output: { id: "sec-1", displayName: input.config.displayName }, reason: null };
        case "list_notebooks":
          return { ok: true, output: { notebooks: [{ id: "nb-1", displayName: `${MARKER}notebook` }], count: 1 }, reason: null };
        case "list_sections":
          return { ok: true, output: { sections: [{ id: "sec-1", displayName: `${MARKER}section` }], count: 1 }, reason: null };
        case "create_database":
          return { ok: true, output: { databaseId: "db-1", title: `${MARKER}database` }, reason: null };
        case "query_database":
          return { ok: true, output: { results: [], hasMore: false, nextCursor: null }, reason: null };
        case "create_board":
          return { ok: true, output: { boardId: "b-1", name: input.config.name, visibility: input.config.visibility }, reason: null };
        case "create_list":
          return { ok: true, output: { listId: "l-1", name: input.config.name, idBoard: input.config.idBoard }, reason: null };
        default:
          return { ok: false, output: null, reason: `no plan for ${input.action}` };
      }
    },
    async smokeReadBack(input): Promise<StepRunOutcome> {
      calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (reads[input.action]) return { ok: true, output: reads[input.action]!, reason: null };
      switch (input.action) {
        case "staged_file":
          return { ok: true, output: { exists: true, sizeBytes: 42 }, reason: null };
        case "file_permissions":
          return { ok: true, output: { found: true, permissionTypes: ["user", "anyone"], permissionRoles: ["owner", "reader"] }, reason: null };
        case "member_boards":
          return { ok: true, output: { boards: [{ name: `${MARKER}board`, closed: false }], count: 1 }, reason: null };
        case "board_lists":
          return { ok: true, output: { lists: [{ name: `${MARKER}list`, closed: false }], count: 1 }, reason: null };
        default:
          return { ok: false, output: null, reason: "no plan" };
      }
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("finisher sweep — shape", () => {
  it("export_document: staged capture, staged_file verify, NO cleanup (mixed-ledger honesty)", () => {
    const f = fixtureFor("google-docs:export_document");
    expect(f.writeHarness?.captureResource?.idPath).toBe("file.storagePath");
    expect(f.writeHarness?.verify?.action).toBe("staged_file");
    expect(f.writeHarness?.cleanup).toBeUndefined();
    expect(f.writeHarness?.liveClass).toBe("writeSafe");
  });

  it("share_document: anyone-link proof + cross-provider Drive delete cleanup", () => {
    const f = fixtureFor("google-docs:share_document");
    expect(f.config.makePublic).toBe(true);
    expect(f.config.sendNotification).toBe(false);
    expect(f.writeHarness?.verify?.expectContains).toEqual({ path: "permissionTypes", value: "anyone" });
    expect(f.writeHarness?.crossProviderCleanup).toBe(true);
    expect(f.writeHarness?.cleanup?.provider).toBe("google-drive");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
  });

  it("onenote/notion/trello creates have NO cleanup (no delete paths) and independent verifies", () => {
    for (const key of [
      "microsoft-onenote:create_notebook",
      "microsoft-onenote:create_section",
      "notion:create_database",
      "trello:create_board",
      "trello:create_list",
    ] as const) {
      const f = fixtureFor(key);
      expect(f.writeHarness?.cleanup).toBeUndefined();
      expect(f.writeHarness?.cleanupKind).toBeUndefined();
      expect(f.writeHarness?.liveClass).toBe("writeSafe");
    }
    expect(fixtureFor("microsoft-onenote:create_notebook").writeHarness?.verify?.action).toBe("list_notebooks");
    expect(fixtureFor("microsoft-onenote:create_section").writeHarness?.verify?.action).toBe("list_sections");
    expect(fixtureFor("notion:create_database").writeHarness?.verify?.expectEmpty).toEqual({ path: "results" });
    expect(fixtureFor("trello:create_board").writeHarness?.verify?.smokeRead).toBe(true);
    expect(fixtureFor("trello:create_list").writeHarness?.verify?.smokeRead).toBe(true);
  });
});

// ─── Flows ───────────────────────────────────────────────────────────────────

describe("finisher sweep — flows", () => {
  it("export_document: PASS; staged_file proves the object; doc + staged left", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("google-docs:export_document"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    expect(r.ledger.created).toBe(2); // doc + staged object, both honestly left
    const exec = deps.calls.find((c) => c.action === "export_document");
    expect(exec?.config.documentId).toBe("doc-1");
    const seam = deps.calls.find((c) => c.action === "staged_file");
    expect(seam?.config.storagePath).toBe(STAGED_PATH);
  });

  it("export_document: a missing staged object is VERIFY_FAILED", async () => {
    const deps = depsWith({ staged_file: { exists: false, sizeBytes: 0 } });
    const r = await runWriteSmoke(fixtureFor("google-docs:export_document"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("share_document: PASS; anyone permission proven; doc cross-provider deleted", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("google-docs:share_document"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("cleaned");
    expect(r.ledger.cleaned).toBe(1);
    const cleanup = deps.calls.find((c) => c.action === "delete_file");
    expect(cleanup?.provider).toBe("google-drive");
    expect(cleanup?.config.fileId).toBe("doc-1");
  });

  it("share_document: a permissions read WITHOUT anyone is VERIFY_FAILED (cleanup still runs)", async () => {
    const deps = depsWith({
      file_permissions: { found: true, permissionTypes: ["user"], permissionRoles: ["owner"] },
    });
    const r = await runWriteSmoke(fixtureFor("google-docs:share_document"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_file")).toBe(true);
  });

  it("create_notebook / create_section: PASS with registered list read-backs; artifacts left", async () => {
    const nb = await runWriteSmoke(fixtureFor("microsoft-onenote:create_notebook"), { ...RUN, envLookup: env }, depsWith());
    expect(nb.status).toBe("PASS");
    expect(nb.artifact).toBe("left");

    const deps = depsWith();
    const sec = await runWriteSmoke(fixtureFor("microsoft-onenote:create_section"), { ...RUN, envLookup: env }, deps);
    expect(sec.status).toBe("PASS");
    expect(sec.ledger.created).toBe(2); // host notebook + section
    const exec = deps.calls.find((c) => c.action === "create_section");
    expect(exec?.config.notebookId).toBe("nb-1"); // ledger-resolved host
  });

  it("create_database: PASS via query_database expectEmpty; artifact left", async () => {
    const deps = depsWith();
    const r = await runWriteSmoke(fixtureFor("notion:create_database"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("PASS");
    expect(r.artifact).toBe("left");
    const exec = deps.calls.find((c) => c.action === "create_database");
    expect(exec?.config.parentPageId).toBe(PARENT_PAGE);
    const verify = deps.calls.find((c) => c.action === "query_database");
    expect(verify?.config.databaseId).toBe("db-1");
  });

  it("create_database: a NON-empty query result is VERIFY_FAILED (id proven but not fresh)", async () => {
    const deps = depsWith();
    // Override the registered-read plan by pointing the fixture at a seam-less
    // fake: simulate query returning rows (wrong database semantics).
    deps.runActionStep = (async (input) => {
      deps.calls.push({ provider: input.provider, action: input.action, config: { ...input.config } });
      if (input.action === "create_database") {
        return { ok: true, output: { databaseId: "db-1", title: `${MARKER}database` }, reason: null };
      }
      if (input.action === "query_database") {
        return { ok: true, output: { results: [{ pageId: "row-1" }], hasMore: false, nextCursor: null }, reason: null };
      }
      return { ok: false, output: null, reason: "no plan" };
    }) as WriteHarnessDeps["runActionStep"];
    const r = await runWriteSmoke(fixtureFor("notion:create_database"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });

  it("create_board / create_list: PASS via the trello seam reads; artifacts left", async () => {
    const b = await runWriteSmoke(fixtureFor("trello:create_board"), { ...RUN, envLookup: env }, depsWith());
    expect(b.status).toBe("PASS");
    expect(b.artifact).toBe("left");

    const deps = depsWith();
    const l = await runWriteSmoke(fixtureFor("trello:create_list"), { ...RUN, envLookup: env }, deps);
    expect(l.status).toBe("PASS");
    expect(l.ledger.created).toBe(2); // host board + list
    const exec = deps.calls.find((c) => c.action === "create_list");
    expect(exec?.config.idBoard).toBe("b-1");
    const verify = deps.calls.find((c) => c.action === "board_lists");
    expect(verify?.config.boardId).toBe("b-1");
  });

  it("create_board: a board list without the marker is VERIFY_FAILED", async () => {
    const deps = depsWith({ member_boards: { boards: [{ name: "Real Board", closed: false }], count: 1 } });
    const r = await runWriteSmoke(fixtureFor("trello:create_board"), { ...RUN, envLookup: env }, deps);
    expect(r.status).toBe("VERIFY_FAILED");
  });
});
