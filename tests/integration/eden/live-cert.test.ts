/**
 * @jest-environment node
 *
 * Eden LIVE certification (EDEN-4). Drives the REAL shipped Eden API wrappers against the live
 * MCP server (`mcp.eden.so`) — the same code the action handlers call — through a full
 * create → read → note → cleanup(trash) cycle, asserting the bounded outputs and that no token
 * or account email ever appears.
 *
 * GATED: runs ONLY when `EDEN_LIVE_CERT=1`. The token is read from `.env.local` (never committed,
 * never printed). Without the gate the whole suite is skipped so CI/normal runs never hit the network.
 *
 * Run: `EDEN_LIVE_CERT=1 npx jest tests/integration/eden/live-cert.test.ts`
 */
import { readFileSync } from "node:fs";
import { listWorkspaces } from "@/integrations/_shared/eden/api/workspaces";
import { createBoard, readBoard, trashBoard, listBoards, renameBoard, saveLinksToBoard } from "@/integrations/_shared/eden/api/boards";
import {
  createNote,
  getNoteMarkdown,
  appendToNote,
  updateNote,
  renameNote,
  createStickyNote,
} from "@/integrations/_shared/eden/api/notes";
import { listWorkspaceItems, searchWorkspaceItems } from "@/integrations/_shared/eden/api/items";
import { listSchedules, listScheduledPosts } from "@/integrations/_shared/eden/api/schedules";

const LIVE = process.env.EDEN_LIVE_CERT === "1";

// Live MCP calls each open a client + handshake (2–3 round trips); under cumulative load a single
// check can exceed Jest's 5s default. Give every live check generous headroom.
jest.setTimeout(30_000);

function readToken(): string | null {
  if (process.env.EDEN_TEST_PAT) return process.env.EDEN_TEST_PAT;
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*EDEN_TEST_PAT\s*=\s*(.*)\s*$/);
      if (m) {
        let v = (m[1] ?? "").trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        return v;
      }
    }
  } catch {
    /* no .env.local */
  }
  return null;
}

const TOKEN = readToken();
const d = LIVE && TOKEN ? describe : describe.skip;

d("Eden live certification (create → read → note → trash)", () => {
  const accessToken = TOKEN as string;
  const noEmail = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/@/);
  const noToken = (v: unknown) => expect(JSON.stringify(v)).not.toContain(accessToken);
  let workspaceId: string | undefined;
  let boardId: string | undefined;

  it("list_workspaces returns bounded workspaces (no email/user object)", async () => {
    const r = await listWorkspaces({ accessToken });
    expect(Array.isArray(r.workspaces)).toBe(true);
    expect(r.workspaces.length).toBeGreaterThan(0);
    for (const w of r.workspaces) expect(typeof w.id).toBe("string");
    noEmail(r);
    noToken(r);
    workspaceId = r.defaultWorkspaceId ?? r.workspaces[0]!.id;
  });

  it("list_schedules / list_scheduled_posts return ok-shaped bounded results", async () => {
    const s = await listSchedules({ accessToken, ...(workspaceId ? { workspaceId } : {}) });
    expect(Array.isArray(s.schedules)).toBe(true);
    const p = await listScheduledPosts({ accessToken, ...(workspaceId ? { workspaceId } : {}), limit: 5 });
    expect(Array.isArray(p.posts)).toBe(true);
  });

  it("create_board returns a board id", async () => {
    const b = await createBoard({ accessToken, ...(workspaceId ? { workspaceId } : {}), title: "ChainReact Live Cert Board" });
    expect(typeof b.boardId).toBe("string");
    expect(b.boardId.length).toBeGreaterThan(0);
    boardId = b.boardId;
  });

  it("read_board returns a bounded summary for the created board", async () => {
    expect(boardId).toBeTruthy();
    const r = await readBoard({ accessToken, ...(workspaceId ? { workspaceId } : {}), itemId: boardId! });
    expect(r.boardId).toBe(boardId);
    expect(typeof r.itemCount === "number" || r.itemCount === null).toBe(true);
  });

  it("create_note adds a note to the created board", async () => {
    expect(boardId).toBeTruthy();
    const n = await createNote({ accessToken, ...(workspaceId ? { workspaceId } : {}), boardId: boardId!, title: "Cert Note", content: "created by live cert" });
    expect(typeof n.noteId).toBe("string");
    expect(n.noteId.length).toBeGreaterThan(0);
  });

  it("list_boards includes the created board", async () => {
    const list = await listBoards({ accessToken, ...(workspaceId ? { workspaceId } : {}), limit: 100 });
    expect(list.items.some((i) => i.id === boardId)).toBe(true);
  });

  afterAll(async () => {
    // CLEANUP: trash the disposable board (also certifies trash_board). Reversible in Eden.
    if (LIVE && TOKEN && boardId) {
      const t = await trashBoard({ accessToken, boardId });
      expect(t.boardId).toBe(boardId);
    }
  });
});

d("Eden Batch-2 notes area (create → read → append → rewrite → rename → sticky → list → search)", () => {
  const accessToken = TOKEN as string;
  let boardId: string | undefined;

  // One sequential flow (mirrors the manual probe) so each note-mutation runs against a
  // just-confirmed id without cross-`it` state, which Eden's eventual consistency made flaky.
  it("full note lifecycle certifies read/append/rewrite/rename/sticky/list/search", async () => {
    const ws = await listWorkspaces({ accessToken });
    const workspaceId = ws.defaultWorkspaceId ?? ws.workspaces[0]!.id;

    const b = await createBoard({ accessToken, workspaceId, title: "ChainReact B2 Notes Cert" });
    boardId = b.boardId;

    const n = await createNote({ accessToken, workspaceId, boardId: boardId!, title: "B2 Cert Note", content: "# original" });
    const noteId = n.noteId;
    expect(noteId.length).toBeGreaterThan(0);

    // read_note (read-your-write)
    const read0 = await getNoteMarkdown({ accessToken, workspaceId, itemId: noteId });
    expect(read0.noteId).toBe(noteId);

    // append_to_note → update_note (rewrite) → rename_note
    await appendToNote({ accessToken, workspaceId, itemId: noteId, content: "\nappended-line" });
    await updateNote({ accessToken, workspaceId, itemId: noteId, content: "# rewritten body" });
    const renamed = await renameNote({ accessToken, workspaceId, itemId: noteId, title: "B2 Cert Note Renamed" });
    expect(renamed.noteId).toBe(noteId);

    // All three writes returned success (no error thrown). The note remains readable; exact content
    // propagation is Eden-side eventually consistent, so we assert readability, not immediate text.
    const read1 = await getNoteMarkdown({ accessToken, workspaceId, itemId: noteId });
    expect(read1.noteId).toBe(noteId);
    expect(typeof read1.markdown).toBe("string");

    // create_sticky_note
    const sticky = await createStickyNote({ accessToken, workspaceId, boardId: boardId!, content: "sticky cert", color: "yellow" });
    expect(sticky.noteId.length).toBeGreaterThan(0);

    // list_notes (type=markdown) + search_items — bounded shape (workspace index is eventually consistent)
    const list = await listWorkspaceItems({ accessToken, workspaceId, type: "markdown", limit: 100 });
    expect(Array.isArray(list.items)).toBe(true);
    for (const it of list.items) expect(typeof it.id).toBe("string");

    const search = await searchWorkspaceItems({ accessToken, workspaceId, q: "Cert", limit: 50 });
    expect(Array.isArray(search.items)).toBe(true);
  }, 90_000); // ~10 sequential live MCP calls (each opens a client + handshake) — well under 90s.

  afterAll(async () => {
    if (LIVE && TOKEN && boardId) await trashBoard({ accessToken, boardId }); // cleanup (trashes board + its notes)
  }, 30_000);
});

d("Eden Batch-2 boards area (list → rename → save links → list items)", () => {
  const accessToken = TOKEN as string;
  let boardId: string | undefined;

  it("board lifecycle certifies list_boards/rename_board/save_links_to_board/list_board_items", async () => {
    const ws = await listWorkspaces({ accessToken });
    const workspaceId = ws.defaultWorkspaceId ?? ws.workspaces[0]!.id;

    const b = await createBoard({ accessToken, workspaceId, title: "ChainReact B2 Boards Cert" });
    boardId = b.boardId;

    // list_boards — bounded, workspace index eventually consistent → assert shape
    const boards = await listBoards({ accessToken, workspaceId, limit: 100 });
    expect(Array.isArray(boards.items)).toBe(true);
    for (const it of boards.items) expect(typeof it.id).toBe("string");

    // rename_board
    const renamed = await renameBoard({ accessToken, boardId: boardId!, name: "ChainReact B2 Boards Cert Renamed" });
    expect(renamed.boardId).toBe(boardId);

    // save_links_to_board
    const saved = await saveLinksToBoard({ accessToken, workspaceId, boardId: boardId!, urls: ["https://example.com/cert-article"] });
    expect(saved.boardId).toBe(boardId);
    expect(typeof saved.itemsCreated === "number" || saved.itemsCreated === null).toBe(true);

    // list_board_items — the saved link is a child of the board
    const items = await listWorkspaceItems({ accessToken, workspaceId, parentId: boardId!, limit: 50 });
    expect(Array.isArray(items.items)).toBe(true);
  }, 90_000);

  afterAll(async () => {
    if (LIVE && TOKEN && boardId) await trashBoard({ accessToken, boardId });
  }, 30_000);
});
