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
import { createBoard, readBoard, trashBoard, listBoards } from "@/integrations/_shared/eden/api/boards";
import { createNote } from "@/integrations/_shared/eden/api/notes";
import { listSchedules, listScheduledPosts } from "@/integrations/_shared/eden/api/schedules";

const LIVE = process.env.EDEN_LIVE_CERT === "1";

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
