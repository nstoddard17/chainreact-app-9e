/**
 * @jest-environment node
 *
 * Eden Batch-2 content/creator/prompt read actions (EDEN-5). Mocks the API wrappers + refreshAndRetry.
 * Proves token seam (eden/null), bounded outputs, no-leak, and strict schemas.
 */
const mockRefreshAndRetry = jest.fn(async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) => apiCall("tok"));
jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (a: unknown) => mockRefreshAndRetry(a as { apiCall: (t: string) => Promise<unknown> }),
}));
const contentApi = { readCard: jest.fn(), listCaptures: jest.fn(), listHighlights: jest.fn() };
jest.mock("@/integrations/_shared/eden/api/content", () => contentApi);
const creatorsApi = { listCreatorLists: jest.fn(), resolveCreator: jest.fn(), analyzeCreator: jest.fn(), followingOverview: jest.fn() };
jest.mock("@/integrations/_shared/eden/api/creators", () => creatorsApi);
const libraryApi = { listPrompts: jest.fn(), getPrompt: jest.fn(), exportSkill: jest.fn() };
jest.mock("@/integrations/_shared/eden/api/library", () => libraryApi);

import { edenReadContent } from "@/integrations/eden/actions/content/readContent";
import { edenResolveCreator } from "@/integrations/eden/actions/creators/resolveCreator";
import { edenResearchCreator } from "@/integrations/eden/actions/creators/researchCreator";
import { edenListPrompts } from "@/integrations/eden/actions/library/listPrompts";
import { edenGetPrompt } from "@/integrations/eden/actions/library/getPrompt";
import { ReadContentConfigSchema } from "@/integrations/eden/actions/content/readContent.schema";
import { ResolveCreatorConfigSchema } from "@/integrations/eden/actions/creators/resolveCreator.schema";

const base = { workflowId: "wf", userId: "u", accountId: "acct-1", runId: "r", nodeId: "n", triggerEvent: {} as never };
beforeEach(() => jest.clearAllMocks());

it("read_content returns bounded post + contentId, routed eden/null", async () => {
  contentApi.readCard.mockResolvedValue({ status: "ok", platform: "youtube", contentId: "uuid", post: { title: "T", transcript: null } });
  const res = await edenReadContent({ ...base, config: { url: "https://youtu.be/x", includeTranscript: false } });
  expect(res.output).toEqual({ status: "ok", platform: "youtube", contentId: "uuid", post: { title: "T", transcript: null } });
  const passed = mockRefreshAndRetry.mock.calls[0]![0] as unknown as { provider: string; providerAccountId: null };
  expect(passed.provider).toBe("eden");
  expect(passed.providerAccountId).toBeNull();
});

it("resolve_creator returns bounded creators + count", async () => {
  creatorsApi.resolveCreator.mockResolvedValue({ creators: [{ id: "c1", username: "mkbhd" }] });
  const res = await edenResolveCreator({ ...base, config: { query: "mkbhd", platform: "youtube" } });
  expect(res.output).toEqual({ creators: [{ id: "c1", username: "mkbhd" }], count: 1 });
});

it("research_creator surfaces indexingStatus (branch, never block)", async () => {
  creatorsApi.analyzeCreator.mockResolvedValue({ creator: { id: "c1" }, metrics: { count: 10 }, indexingStatus: "pending", indexedPostCount: 3 });
  const res = await edenResearchCreator({ ...base, config: { query: "mkbhd" } });
  expect(res.output.indexingStatus).toBe("pending");
  expect(res.output.metrics).toEqual({ count: 10 });
});

it("list_prompts + get_prompt return bounded fields (no account identity)", async () => {
  libraryApi.listPrompts.mockResolvedValue({ prompts: [{ id: "p1", title: "T", source: "user" }] });
  expect((await edenListPrompts({ ...base, config: {} })).output).toEqual({ prompts: [{ id: "p1", title: "T", source: "user" }], count: 1 });
  libraryApi.getPrompt.mockResolvedValue({ id: "p1", title: "T", summary: null, description: null, category: null, systemPrompt: "SP", toolsEnabled: [], usesVoiceProfile: false });
  const g = await edenGetPrompt({ ...base, config: { promptId: "p1" } });
  expect(g.output.systemPrompt).toBe("SP");
  expect(JSON.stringify(g.output)).not.toMatch(/@/); // no email
});

it("strict schemas: read_content requires includeTranscript; resolve requires query", () => {
  expect(ReadContentConfigSchema.safeParse({ url: "https://x.com/a" }).success).toBe(false); // missing includeTranscript
  expect(ReadContentConfigSchema.safeParse({ url: "not-a-url", includeTranscript: true }).success).toBe(false);
  expect(ResolveCreatorConfigSchema.safeParse({}).success).toBe(false);
  expect(ResolveCreatorConfigSchema.safeParse({ query: "x", extra: 1 }).success).toBe(false);
});
