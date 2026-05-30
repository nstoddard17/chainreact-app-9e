/**
 * @jest-environment node
 *
 * Tests for `create_issue` action handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockIssuesCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/github/api/issues", () => ({
  issuesCreate: (...a: unknown[]) => mockIssuesCreate(...a),
}));

import { createIssue } from "@/integrations/github/actions/createIssue";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockIssuesCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(provider = "manual"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-10T12:00:00Z",
    providerAccountId: provider === "github" ? "octocat" : "n/a",
    payload: {},
  };
}

const baseInput = {
  workflowId: "wf",
  userId: "u",
  accountId: "acct-u",
  runId: "r",
  nodeId: "n",
  triggerEvent: trigger(),
};

const baseIssue = {
  id: 12345,
  number: 7,
  title: "Bug",
  body: "Description",
  state: "open",
  html_url: "https://github.com/octocat/hello/issues/7",
  labels: [{ name: "bug" }, { name: "p1" }],
  assignees: [{ login: "alice", id: 1 }],
  user: { login: "octocat", id: 1 },
  created_at: "2026-05-10T12:00:00Z",
};

describe("create_issue — happy path", () => {
  it("calls issuesCreate with parsed owner/repo + required fields", async () => {
    mockIssuesCreate.mockResolvedValueOnce(baseIssue);
    await createIssue({
      ...baseInput,
      config: { repository: "octocat/hello", title: "Bug" },
    });
    const arg = mockIssuesCreate.mock.calls[0]![0]!;
    expect(arg.owner).toBe("octocat");
    expect(arg.repo).toBe("hello");
    expect(arg.title).toBe("Bug");
  });

  it("forwards body / labels / assignees / milestone when supplied", async () => {
    mockIssuesCreate.mockResolvedValueOnce(baseIssue);
    await createIssue({
      ...baseInput,
      config: {
        repository: "u/r",
        title: "Bug",
        body: "Description",
        labels: ["bug", "p1"],
        assignees: ["alice"],
        milestone: 3,
      },
    });
    const arg = mockIssuesCreate.mock.calls[0]![0]!;
    expect(arg.body).toBe("Description");
    expect(arg.labels).toEqual(["bug", "p1"]);
    expect(arg.assignees).toEqual(["alice"]);
    expect(arg.milestone).toBe(3);
  });

  it("returns canonical output shape", async () => {
    mockIssuesCreate.mockResolvedValueOnce(baseIssue);
    const result = await createIssue({
      ...baseInput,
      config: { repository: "octocat/hello", title: "Bug" },
    });
    expect(result.output).toEqual({
      issueId: 12345,
      issueNumber: 7,
      title: "Bug",
      body: "Description",
      state: "open",
      url: "https://github.com/octocat/hello/issues/7",
      repository: "octocat/hello",
      labels: ["bug", "p1"],
      assignees: ["alice"],
      createdAt: "2026-05-10T12:00:00Z",
    });
  });

  it("maps null body to null in output", async () => {
    mockIssuesCreate.mockResolvedValueOnce({ ...baseIssue, body: null });
    const result = await createIssue({
      ...baseInput,
      config: { repository: "u/r", title: "x" },
    });
    expect(result.output.body).toBeNull();
  });
});

describe("create_issue — refreshAndRetry wrapping", () => {
  it("calls refreshAndRetry with provider='github'", async () => {
    mockIssuesCreate.mockResolvedValueOnce(baseIssue);
    await createIssue({
      ...baseInput,
      config: { repository: "u/r", title: "x" },
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("github");
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.userId).toBe("u");
  });

  it("threads accountId from github trigger event", async () => {
    mockIssuesCreate.mockResolvedValueOnce(baseIssue);
    await createIssue({
      ...baseInput,
      triggerEvent: trigger("github"),
      config: { repository: "u/r", title: "x" },
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.accountId).toBe("octocat");
  });

  it("uses null accountId for non-github triggers", async () => {
    mockIssuesCreate.mockResolvedValueOnce(baseIssue);
    await createIssue({
      ...baseInput,
      triggerEvent: trigger("manual"),
      config: { repository: "u/r", title: "x" },
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.accountId).toBeNull();
  });
});

describe("create_issue — schema validation", () => {
  it("rejects missing repository", async () => {
    await expect(
      createIssue({ ...baseInput, config: { title: "x" } }),
    ).rejects.toThrow();
  });

  it("rejects missing title", async () => {
    await expect(
      createIssue({ ...baseInput, config: { repository: "u/r" } }),
    ).rejects.toThrow();
  });

  it("rejects empty title (min(1))", async () => {
    await expect(
      createIssue({ ...baseInput, config: { repository: "u/r", title: "" } }),
    ).rejects.toThrow();
  });

  it("rejects malformed repository (no slash)", async () => {
    await expect(
      createIssue({
        ...baseInput,
        config: { repository: "no-slash", title: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown extra fields (strict schema)", async () => {
    await expect(
      createIssue({
        ...baseInput,
        config: { repository: "u/r", title: "x", extra: "field" },
      }),
    ).rejects.toThrow();
  });
});
