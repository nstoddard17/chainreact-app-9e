/**
 * @jest-environment node
 *
 * Tests for `create_gist` action handler.
 *
 * `isPublic` is required at the schema layer (no default) — Q11
 * consent gate. Public gists are world-readable.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGistsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/github/api/gists", () => ({
  gistsCreate: (...a: unknown[]) => mockGistsCreate(...a),
}));

import { createGist } from "@/integrations/github/actions/createGist";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGistsCreate.mockReset();
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

const baseGist = {
  id: "abc123def456",
  description: "A test gist",
  public: false,
  html_url: "https://gist.github.com/octocat/abc123",
  files: {
    "snippet.ts": { filename: "snippet.ts", content: "x" },
  },
  created_at: "2026-05-10T12:00:00Z",
};

describe("create_gist — happy path", () => {
  it("calls gistsCreate with required fields (filename, content, public)", async () => {
    mockGistsCreate.mockResolvedValueOnce(baseGist);
    await createGist({
      ...baseInput,
      config: {
        filename: "snippet.ts",
        content: "console.log('hi')",
        isPublic: false,
      },
    });
    const arg = mockGistsCreate.mock.calls[0]![0]!;
    expect(arg.filename).toBe("snippet.ts");
    expect(arg.content).toBe("console.log('hi')");
    // schema field is `isPublic`; wrapper field is `public` —
    // verifies the rename.
    expect(arg.public).toBe(false);
  });

  it("forwards isPublic=true to wrapper as public=true", async () => {
    mockGistsCreate.mockResolvedValueOnce({ ...baseGist, public: true });
    await createGist({
      ...baseInput,
      config: {
        filename: "x.ts",
        content: "x",
        isPublic: true,
      },
    });
    expect(mockGistsCreate.mock.calls[0]![0]!.public).toBe(true);
  });

  it("forwards description when supplied", async () => {
    mockGistsCreate.mockResolvedValueOnce(baseGist);
    await createGist({
      ...baseInput,
      config: {
        filename: "x.ts",
        content: "x",
        isPublic: false,
        description: "A test gist",
      },
    });
    expect(mockGistsCreate.mock.calls[0]![0]!.description).toBe("A test gist");
  });

  it("returns canonical output shape", async () => {
    mockGistsCreate.mockResolvedValueOnce(baseGist);
    const result = await createGist({
      ...baseInput,
      config: { filename: "snippet.ts", content: "x", isPublic: false },
    });
    expect(result.output).toEqual({
      gistId: "abc123def456",
      url: "https://gist.github.com/octocat/abc123",
      description: "A test gist",
      public: false,
      files: ["snippet.ts"],
      createdAt: "2026-05-10T12:00:00Z",
    });
  });

  it("output.files lists the gist's filenames", async () => {
    mockGistsCreate.mockResolvedValueOnce({
      ...baseGist,
      files: {
        "a.ts": { filename: "a.ts" },
        "b.ts": { filename: "b.ts" },
      },
    });
    const result = await createGist({
      ...baseInput,
      config: { filename: "a.ts", content: "x", isPublic: false },
    });
    expect(result.output.files).toEqual(["a.ts", "b.ts"]);
  });
});

describe("create_gist — schema validation (Q11 consent gate)", () => {
  it("rejects missing isPublic (required, no default)", async () => {
    // V1 silently defaulted to `false` (secret). V2 requires the
    // workflow author to choose explicitly.
    await expect(
      createGist({
        ...baseInput,
        config: { filename: "x.ts", content: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects missing filename", async () => {
    await expect(
      createGist({
        ...baseInput,
        config: { content: "x", isPublic: false },
      }),
    ).rejects.toThrow();
  });

  it("rejects missing content", async () => {
    await expect(
      createGist({
        ...baseInput,
        config: { filename: "x.ts", isPublic: false },
      }),
    ).rejects.toThrow();
  });

  it("rejects empty content", async () => {
    await expect(
      createGist({
        ...baseInput,
        config: { filename: "x.ts", content: "", isPublic: false },
      }),
    ).rejects.toThrow();
  });

  it("rejects filename with path separators", async () => {
    await expect(
      createGist({
        ...baseInput,
        config: { filename: "dir/x.ts", content: "x", isPublic: false },
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown extra fields", async () => {
    await expect(
      createGist({
        ...baseInput,
        config: {
          filename: "x.ts",
          content: "x",
          isPublic: false,
          extra: "field",
        },
      }),
    ).rejects.toThrow();
  });
});
