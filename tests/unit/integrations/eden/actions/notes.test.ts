/**
 * @jest-environment node
 *
 * Eden Batch-2 note actions (EDEN-5). Mocks the note/item API wrappers + refreshAndRetry. Proves the
 * token seam (provider=eden, providerAccountId=null), bounded outputs, no-leak, and schema rejection.
 */
const mockRefreshAndRetry = jest.fn(async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) => apiCall("tok"));
jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (a: unknown) => mockRefreshAndRetry(a as { apiCall: (t: string) => Promise<unknown> }),
}));

const notesApi = {
  getNoteMarkdown: jest.fn(),
  appendToNote: jest.fn(),
  updateNote: jest.fn(),
  renameNote: jest.fn(),
  createStickyNote: jest.fn(),
};
jest.mock("@/integrations/_shared/eden/api/notes", () => notesApi);
const itemsApi = { listWorkspaceItems: jest.fn(), searchWorkspaceItems: jest.fn() };
jest.mock("@/integrations/_shared/eden/api/items", () => itemsApi);

import { edenReadNote } from "@/integrations/eden/actions/notes/readNote";
import { edenAppendToNote } from "@/integrations/eden/actions/notes/appendToNote";
import { edenUpdateNote } from "@/integrations/eden/actions/notes/updateNote";
import { edenRenameNote } from "@/integrations/eden/actions/notes/renameNote";
import { edenCreateStickyNote } from "@/integrations/eden/actions/notes/createStickyNote";
import { edenListNotes } from "@/integrations/eden/actions/notes/listNotes";
import { edenSearchItems } from "@/integrations/eden/actions/notes/searchItems";
import { ReadNoteConfigSchema } from "@/integrations/eden/actions/notes/readNote.schema";
import { AppendToNoteConfigSchema } from "@/integrations/eden/actions/notes/appendToNote.schema";

const base = { workflowId: "wf", userId: "u", accountId: "acct-1", runId: "r", nodeId: "n", triggerEvent: {} as never };
beforeEach(() => jest.clearAllMocks());

it("read_note returns bounded note fields and routes through eden/null", async () => {
  notesApi.getNoteMarkdown.mockResolvedValue({ noteId: "i1", title: "T", markdown: "# body", accessMode: "owner" });
  const res = await edenReadNote({ ...base, config: { itemId: "i1" } });
  expect(res.output).toEqual({ noteId: "i1", title: "T", markdown: "# body", accessMode: "owner" });
  const passed = mockRefreshAndRetry.mock.calls[0]![0] as unknown as { provider: string; providerAccountId: null };
  expect(passed.provider).toBe("eden");
  expect(passed.providerAccountId).toBeNull();
});

it("append_to_note / update_note / rename_note return bounded outputs", async () => {
  notesApi.appendToNote.mockResolvedValue({ noteId: "i1" });
  expect((await edenAppendToNote({ ...base, config: { itemId: "i1", content: "x" } })).output).toEqual({ noteId: "i1" });
  notesApi.updateNote.mockResolvedValue({ noteId: "i1" });
  expect((await edenUpdateNote({ ...base, config: { itemId: "i1", content: "y" } })).output).toEqual({ noteId: "i1" });
  notesApi.renameNote.mockResolvedValue({ noteId: "i1", title: "New" });
  expect((await edenRenameNote({ ...base, config: { itemId: "i1", title: "New" } })).output).toEqual({ noteId: "i1", title: "New" });
});

it("create_sticky_note returns note + board id", async () => {
  notesApi.createStickyNote.mockResolvedValue({ noteId: "s1", boardId: "b1" });
  const res = await edenCreateStickyNote({ ...base, config: { boardId: "b1", content: "hi" } });
  expect(res.output).toEqual({ noteId: "s1", boardId: "b1" });
});

it("list_notes / search_items expose pagination + hasMore", async () => {
  itemsApi.listWorkspaceItems.mockResolvedValue({ items: [{ id: "i1" }], count: 1, totalCount: 1, nextCursor: "c" });
  const l = await edenListNotes({ ...base, config: {} });
  expect(l.output.hasMore).toBe(true);
  expect(l.output.notes).toEqual([{ id: "i1" }]);
  itemsApi.searchWorkspaceItems.mockResolvedValue({ items: [], count: 0, totalCount: 0, nextCursor: null });
  const s = await edenSearchItems({ ...base, config: { query: "z" } });
  expect(s.output.hasMore).toBe(false);
});

it("schemas are strict and enforce required fields", () => {
  expect(ReadNoteConfigSchema.safeParse({}).success).toBe(false);
  expect(ReadNoteConfigSchema.safeParse({ itemId: "i", extra: 1 }).success).toBe(false);
  expect(AppendToNoteConfigSchema.safeParse({ itemId: "i" }).success).toBe(false); // missing content
  expect(AppendToNoteConfigSchema.safeParse({ itemId: "i", content: "" }).success).toBe(false);
});
