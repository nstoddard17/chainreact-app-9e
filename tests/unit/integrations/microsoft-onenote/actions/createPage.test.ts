/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockPagesCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onenote/api/pagesCreate", () => ({
  pagesCreate: (...args: unknown[]) => mockPagesCreate(...args),
}));

import { createPage } from "@/integrations/microsoft-onenote/actions/createPage";
import { CreatePageConfigSchema } from "@/integrations/microsoft-onenote/actions/createPage.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPagesCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-onenote",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("create_page schema", () => {
  it("ONENOTE-1 D-ON1: contentType defaults to 'text/html' (V2-native — flipped from V1's 'text/plain')", () => {
    const parsed = CreatePageConfigSchema.parse({
      sectionId: "s-1",
      title: "Hi",
    });
    expect(parsed.contentType).toBe("text/html");
  });

  it("accepts all three Graph-valid contentType values", () => {
    for (const ct of ["text/html", "text/plain", "application/xhtml+xml"]) {
      const parsed = CreatePageConfigSchema.parse({
        sectionId: "s-1",
        title: "Hi",
        contentType: ct,
      });
      expect(parsed.contentType).toBe(ct);
    }
  });

  it("rejects unknown contentType values", () => {
    expect(() =>
      CreatePageConfigSchema.parse({
        sectionId: "s-1",
        title: "Hi",
        contentType: "text/markdown",
      }),
    ).toThrow();
  });

  it("accepts optional notebookId as UI scope-narrower (ONENOTE-4 — handler ignores)", () => {
    // ONENOTE-4 added `notebookId` as an OPTIONAL UI scope-narrower
    // so the meta-cascade chain `notebookId` → `sectionId` works in
    // the builder picker. The handler ignores it; this just verifies
    // the schema accepts it without erroring.
    expect(() =>
      CreatePageConfigSchema.parse({
        sectionId: "s-1",
        title: "Hi",
        notebookId: "n-1",
      }),
    ).not.toThrow();
  });

  it("rejects truly unknown fields (strict mode retained)", () => {
    expect(() =>
      CreatePageConfigSchema.parse({
        sectionId: "s-1",
        title: "Hi",
        bogusField: "x",
      }),
    ).toThrow();
  });

  it("requires sectionId + title", () => {
    expect(() => CreatePageConfigSchema.parse({ title: "x" })).toThrow();
    expect(() => CreatePageConfigSchema.parse({ sectionId: "s" })).toThrow();
  });
});

describe("create_page handler", () => {
  it("builds an HTML body with title + content for text/html (V2 default)", async () => {
    mockPagesCreate.mockResolvedValueOnce({
      id: "p-1",
      title: "Hello",
      contentUrl: "https://x/p-1/content",
      links: { oneNoteWebUrl: { href: "https://x/edit" } },
      createdDateTime: "2026-05-09T12:00:00Z",
    });

    await createPage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        sectionId: "s-1",
        title: "Hello",
        content: "<p>body text</p>",
        // Note: not setting contentType — schema applies the text/html
        // default in the handler's schema.parse path.
      },
      triggerEvent: trigger(),
    });

    const call = mockPagesCreate.mock.calls[0]![0];
    expect(call.sectionId).toBe("s-1");
    expect(call.contentType).toBe("text/html");
    expect(call.htmlBody).toContain("<title>Hello</title>");
    expect(call.htmlBody).toContain("<p>body text</p>");
  });

  it("wraps text/plain content in <p> tags split on newlines + escapes HTML", async () => {
    mockPagesCreate.mockResolvedValueOnce({
      id: "p-2",
      title: "x",
    });

    await createPage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        sectionId: "s-1",
        title: "Plain",
        content: "line one\nline two\n<not-a-tag>",
        contentType: "text/plain",
      },
      triggerEvent: trigger(),
    });

    const body = mockPagesCreate.mock.calls[0]![0].htmlBody as string;
    expect(body).toContain("<p>line one</p>");
    expect(body).toContain("<p>line two</p>");
    // Raw "<" smuggled in by author content gets escaped.
    expect(body).toContain("&lt;not-a-tag&gt;");
    // text/plain wire content type is still text/html.
    expect(mockPagesCreate.mock.calls[0]![0].contentType).toBe("text/html");
  });

  it("passes application/xhtml+xml through as the wire Content-Type", async () => {
    mockPagesCreate.mockResolvedValueOnce({ id: "p-3", title: "x" });
    await createPage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        sectionId: "s-1",
        title: "X",
        content: "<p/>",
        contentType: "application/xhtml+xml",
      },
      triggerEvent: trigger(),
    });
    expect(mockPagesCreate.mock.calls[0]![0].contentType).toBe(
      "application/xhtml+xml",
    );
  });

  it("escapes title attribute to prevent HTML injection", async () => {
    mockPagesCreate.mockResolvedValueOnce({ id: "p", title: "" });
    await createPage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        sectionId: "s-1",
        title: `<script>alert("xss")</script>`,
        content: "ok",
      },
      triggerEvent: trigger(),
    });
    const body = mockPagesCreate.mock.calls[0]![0].htmlBody as string;
    expect(body).toContain("&lt;script&gt;");
    expect(body).not.toContain("<script>alert");
  });

  it("output shape: id / title / contentUrl / webUrl / createdDateTime / lastModifiedDateTime / level / order", async () => {
    mockPagesCreate.mockResolvedValueOnce({
      id: "p-x",
      title: "Returned Title",
      contentUrl: "https://content-url",
      links: { oneNoteWebUrl: { href: "https://web-url" } },
      createdDateTime: "2026-05-09T12:00:00Z",
      lastModifiedDateTime: "2026-05-09T13:00:00Z",
      level: 0,
      order: 1,
    });
    const result = await createPage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { sectionId: "s", title: "T" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      id: "p-x",
      title: "Returned Title",
      contentUrl: "https://content-url",
      webUrl: "https://web-url",
      createdDateTime: "2026-05-09T12:00:00Z",
      lastModifiedDateTime: "2026-05-09T13:00:00Z",
      level: 0,
      order: 1,
    });
  });

  it("falls back to null when links / metadata fields are missing", async () => {
    mockPagesCreate.mockResolvedValueOnce({ id: "p", title: "T" });
    const result = await createPage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { sectionId: "s", title: "T" },
      triggerEvent: trigger(),
    });
    expect(result.output.webUrl).toBeNull();
    expect(result.output.contentUrl).toBeNull();
    expect(result.output.level).toBeNull();
  });

  it("uses refreshAndRetry with provider='microsoft-onenote'", async () => {
    mockPagesCreate.mockResolvedValueOnce({ id: "p", title: "x" });
    await createPage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { sectionId: "s", title: "T" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe(
      "microsoft-onenote",
    );
    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBe(
      "alice@contoso.com",
    );
  });
});
