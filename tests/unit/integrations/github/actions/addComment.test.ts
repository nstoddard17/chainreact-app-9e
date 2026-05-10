/**
 * @jest-environment node
 *
 * Tests for `add_comment` action handler. Works for both issue and
 * PR comments — GitHub treats PRs as issues for the comment API.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockIssueCommentsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/github/api/issues", () => ({
  issueCommentsCreate: (...a: unknown[]) => mockIssueCommentsCreate(...a),
}));

import { addComment } from "@/integrations/github/actions/addComment";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockIssueCommentsCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const triggerEvent: TriggerEvent = {
  provider: "manual",
  eventType: "manual",
  eventId: "evt-1",
  occurredAt: "2026-05-10T12:00:00Z",
  accountId: "n/a",
  payload: {},
};

const baseInput = {
  workflowId: "wf",
  userId: "u",
  runId: "r",
  nodeId: "n",
  triggerEvent,
};

const baseComment = {
  id: 99,
  body: "Thanks for filing.",
  html_url: "https://github.com/octocat/hello/issues/42#issuecomment-99",
  created_at: "2026-05-10T12:00:00Z",
};

describe("add_comment — happy path", () => {
  it("calls issueCommentsCreate with parsed owner/repo + issueNumber + body", async () => {
    mockIssueCommentsCreate.mockResolvedValueOnce(baseComment);
    await addComment({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        issueNumber: 42,
        body: "Thanks for filing.",
      },
    });
    expect(mockIssueCommentsCreate.mock.calls[0]![0]!).toMatchObject({
      owner: "octocat",
      repo: "hello",
      issueNumber: 42,
      body: "Thanks for filing.",
    });
  });

  it("coerces numeric-string issueNumber to number (workflow variable shape)", async () => {
    // Workflow variables often arrive as strings from upstream
    // resolution. The schema's z.coerce.number() handles this.
    mockIssueCommentsCreate.mockResolvedValueOnce(baseComment);
    await addComment({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        issueNumber: "42",
        body: "x",
      },
    });
    expect(mockIssueCommentsCreate.mock.calls[0]![0]!.issueNumber).toBe(42);
  });

  it("returns canonical output shape", async () => {
    mockIssueCommentsCreate.mockResolvedValueOnce(baseComment);
    const result = await addComment({
      ...baseInput,
      config: {
        repository: "octocat/hello",
        issueNumber: 42,
        body: "Thanks.",
      },
    });
    expect(result.output).toEqual({
      commentId: 99,
      url: "https://github.com/octocat/hello/issues/42#issuecomment-99",
      body: "Thanks for filing.",
      repository: "octocat/hello",
      issueNumber: 42,
      createdAt: "2026-05-10T12:00:00Z",
    });
  });
});

describe("add_comment — schema validation", () => {
  it("rejects missing repository", async () => {
    await expect(
      addComment({
        ...baseInput,
        config: { issueNumber: 1, body: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects missing issueNumber", async () => {
    await expect(
      addComment({
        ...baseInput,
        config: { repository: "u/r", body: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects missing body", async () => {
    await expect(
      addComment({
        ...baseInput,
        config: { repository: "u/r", issueNumber: 1 },
      }),
    ).rejects.toThrow();
  });

  it("rejects empty body", async () => {
    await expect(
      addComment({
        ...baseInput,
        config: { repository: "u/r", issueNumber: 1, body: "" },
      }),
    ).rejects.toThrow();
  });

  it("rejects negative issueNumber", async () => {
    await expect(
      addComment({
        ...baseInput,
        config: { repository: "u/r", issueNumber: -1, body: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects zero issueNumber", async () => {
    await expect(
      addComment({
        ...baseInput,
        config: { repository: "u/r", issueNumber: 0, body: "x" },
      }),
    ).rejects.toThrow();
  });
});
