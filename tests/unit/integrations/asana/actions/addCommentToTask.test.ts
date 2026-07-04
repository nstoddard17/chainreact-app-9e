/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockStoriesCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/asana/api/stories", () => ({
  storiesCreateForTask: (...args: unknown[]) => mockStoriesCreate(...args),
}));

import { addCommentToTask } from "@/integrations/asana/actions/comments/addCommentToTask";
import { AddCommentToTaskConfigSchema } from "@/integrations/asana/actions/comments/addCommentToTask.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockStoriesCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "asana",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-04T00:00:00Z",
    providerAccountId: "marcus@example.test",
    payload: {},
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

describe("add_comment_to_task schema", () => {
  it("requires taskGid and non-empty text; strict", () => {
    expect(() =>
      AddCommentToTaskConfigSchema.parse({ text: "hi" }),
    ).toThrow();
    expect(() =>
      AddCommentToTaskConfigSchema.parse({ taskGid: "t-1", text: "" }),
    ).toThrow();
    expect(() =>
      AddCommentToTaskConfigSchema.parse({ taskGid: "t-1", text: "hi" }),
    ).not.toThrow();
    expect(() =>
      AddCommentToTaskConfigSchema.parse({ taskGid: "t-1", text: "hi", x: 1 }),
    ).toThrow();
  });
});

describe("add_comment_to_task handler", () => {
  it("posts the comment and returns the bounded story output", async () => {
    mockStoriesCreate.mockResolvedValueOnce({
      gid: "s-1",
      text: "hello there",
      created_at: "2026-07-04T03:00:00Z",
    });
    const result = await addCommentToTask(
      baseInput({ taskGid: "t-1", text: "hello there" }),
    );
    expect(mockStoriesCreate.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      taskGid: "t-1",
      text: "hello there",
    });
    expect(result.output).toEqual({
      storyGid: "s-1",
      text: "hello there",
      createdAt: "2026-07-04T03:00:00Z",
    });
  });

  it("falls back to the configured text when the provider omits the echo", async () => {
    mockStoriesCreate.mockResolvedValueOnce({
      gid: "s-2",
      text: null,
      created_at: null,
    });
    const result = await addCommentToTask(
      baseInput({ taskGid: "t-1", text: "configured" }),
    );
    expect(result.output.text).toBe("configured");
    expect(result.output.createdAt).toBeNull();
  });

  it("uses refreshAndRetry with provider='asana'", async () => {
    mockStoriesCreate.mockResolvedValueOnce({ gid: "s", text: "t", created_at: null });
    await addCommentToTask(baseInput({ taskGid: "t-1", text: "t" }));
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("asana");
  });

  it("propagates provider failures verbatim", async () => {
    mockStoriesCreate.mockRejectedValueOnce(new Error("Asana rate limit hit (HTTP 429)"));
    await expect(
      addCommentToTask(baseInput({ taskGid: "t-1", text: "t" })),
    ).rejects.toThrow(/429/);
  });
});
