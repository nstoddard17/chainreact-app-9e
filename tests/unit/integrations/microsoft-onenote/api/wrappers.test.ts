/**
 * @jest-environment node
 *
 * Combined coverage for the 11 OneNote Graph API wrappers —
 * Slice 3.ONENOTE-2.
 *
 * Per-wrapper smoke + URL shape + error sanitization. Each wrapper
 * follows the same skeleton (graphApiBase + `Authorization: Bearer`
 * + Graph error envelope surfaced via surfaceGraphError + 401 →
 * Unauthorized401Error + 404 → NotFoundError + other failures →
 * generic Error with the surfaced detail).
 */
import {
  NotFoundError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

import { notebooksList } from "@/integrations/microsoft-onenote/api/notebooksList";
import { notebooksCreate } from "@/integrations/microsoft-onenote/api/notebooksCreate";
import { notebooksGet } from "@/integrations/microsoft-onenote/api/notebooksGet";
import { sectionsList } from "@/integrations/microsoft-onenote/api/sectionsList";
import { sectionsCreate } from "@/integrations/microsoft-onenote/api/sectionsCreate";
import { sectionsGet } from "@/integrations/microsoft-onenote/api/sectionsGet";
import { pagesList } from "@/integrations/microsoft-onenote/api/pagesList";
import { pagesCreate } from "@/integrations/microsoft-onenote/api/pagesCreate";
import { pagesGet } from "@/integrations/microsoft-onenote/api/pagesGet";
import { pageContentGet } from "@/integrations/microsoft-onenote/api/pageContentGet";
import { pageContentUpdate } from "@/integrations/microsoft-onenote/api/pageContentUpdate";
import { pagesDelete } from "@/integrations/microsoft-onenote/api/pagesDelete";
import { pagesCopyToSection } from "@/integrations/microsoft-onenote/api/pagesCopyToSection";

beforeEach(() => {
  jest.restoreAllMocks();
});

function mockFetch(
  status: number,
  body: unknown,
  init: { headers?: Record<string, string> } = {},
) {
  // Per the Fetch spec, Response disallows a body for null-body
  // status codes (101 / 103 / 204 / 205 / 304). Use null + the
  // raw status when status is one of those.
  const nullBodyStatuses = new Set([101, 103, 204, 205, 304]);
  const responseBody =
    nullBodyStatuses.has(status)
      ? null
      : typeof body === "string"
        ? body
        : JSON.stringify(body);
  const response = new Response(responseBody, {
    status,
    headers: init.headers,
  });
  return jest.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

const TOK = "test-access-token-secret";
const GRAPH_BODY_WITH_TOKEN_HINT = {
  error: {
    code: "InvalidRequest",
    message: "graph error details that should not contain the token",
  },
};

describe("notebooksList", () => {
  it("GETs /me/onenote/notebooks with $orderby + $top + Authorization", async () => {
    const spy = mockFetch(200, { value: [{ id: "nb-1" }] });
    const result = await notebooksList({
      accessToken: TOK,
      orderBy: "displayName asc",
      top: 50,
    });
    expect(result.notebooks).toHaveLength(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain("/v1.0/me/onenote/notebooks");
    expect(String(url)).toContain("%24orderby=displayName+asc");
    expect(String(url)).toContain("%24top=50");
    expect(
      init!.headers as Record<string, string>,
    ).toMatchObject({
      Authorization: `Bearer ${TOK}`,
    });
  });

  it("throws Unauthorized401Error on 401", async () => {
    mockFetch(401, { error: { message: "unauth" } });
    await expect(notebooksList({ accessToken: TOK })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("error message does NOT leak the access token", async () => {
    mockFetch(500, GRAPH_BODY_WITH_TOKEN_HINT);
    let thrown: unknown;
    try {
      await notebooksList({ accessToken: TOK });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).not.toContain(TOK);
  });
});

describe("notebooksCreate", () => {
  it("POSTs JSON {displayName} to /me/onenote/notebooks", async () => {
    const spy = mockFetch(201, { id: "nb-x", displayName: "Hello" });
    const result = await notebooksCreate({
      accessToken: TOK,
      displayName: "Hello",
    });
    expect(result.id).toBe("nb-x");
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/v1\.0\/me\/onenote\/notebooks$/);
    expect(init!.method).toBe("POST");
    expect(init!.body).toBe(
      JSON.stringify({ displayName: "Hello" }),
    );
  });
});

describe("notebooksGet", () => {
  it("GETs /me/onenote/notebooks/{id}", async () => {
    const spy = mockFetch(200, { id: "nb-1" });
    await notebooksGet({ accessToken: TOK, notebookId: "nb-1" });
    expect(String(spy.mock.calls[0]![0])).toContain(
      "/v1.0/me/onenote/notebooks/nb-1",
    );
  });

  it("encodes special-character notebook ids in the URL", async () => {
    const spy = mockFetch(200, { id: "x" });
    await notebooksGet({ accessToken: TOK, notebookId: "id/with/slash" });
    expect(String(spy.mock.calls[0]![0])).toContain(
      "id%2Fwith%2Fslash",
    );
  });

  it("throws NotFoundError on 404", async () => {
    mockFetch(404, { error: { code: "ItemNotFound", message: "not found" } });
    await expect(
      notebooksGet({ accessToken: TOK, notebookId: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("sectionsList", () => {
  it("GETs /me/onenote/notebooks/{notebookId}/sections", async () => {
    const spy = mockFetch(200, { value: [{ id: "sec-1" }] });
    await sectionsList({ accessToken: TOK, notebookId: "nb-1" });
    expect(String(spy.mock.calls[0]![0])).toContain(
      "/v1.0/me/onenote/notebooks/nb-1/sections",
    );
  });

  it("throws NotFoundError on 404 (parent notebook missing)", async () => {
    mockFetch(404, { error: { message: "not found" } });
    await expect(
      sectionsList({ accessToken: TOK, notebookId: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("sectionsCreate", () => {
  it("POSTs {displayName} to /me/onenote/notebooks/{id}/sections", async () => {
    const spy = mockFetch(201, { id: "sec-x" });
    await sectionsCreate({
      accessToken: TOK,
      notebookId: "nb-1",
      displayName: "Q4",
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain("/me/onenote/notebooks/nb-1/sections");
    expect(init!.body).toBe(
      JSON.stringify({ displayName: "Q4" }),
    );
  });
});

describe("sectionsGet", () => {
  it("GETs /me/onenote/sections/{id}", async () => {
    const spy = mockFetch(200, { id: "sec-1" });
    await sectionsGet({ accessToken: TOK, sectionId: "sec-1" });
    expect(String(spy.mock.calls[0]![0])).toContain(
      "/me/onenote/sections/sec-1",
    );
  });
});

describe("pagesList", () => {
  it("GETs /me/onenote/sections/{id}/pages with $top + $orderby", async () => {
    const spy = mockFetch(200, { value: [{ id: "p-1" }] });
    await pagesList({
      accessToken: TOK,
      sectionId: "sec-1",
      top: 20,
      orderBy: "lastModifiedDateTime desc",
    });
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain("/me/onenote/sections/sec-1/pages");
    expect(url).toContain("%24top=20");
    expect(url).toMatch(/%24orderby=lastModifiedDateTime/i);
  });

  it("does NOT add $filter even when callers somehow inject one (wrapper has no filter param)", async () => {
    const spy = mockFetch(200, { value: [] });
    await pagesList({ accessToken: TOK, sectionId: "sec-1" });
    const url = String(spy.mock.calls[0]![0]);
    expect(url).not.toContain("%24filter");
  });
});

describe("pagesCreate", () => {
  it("POSTs HTML body with text/html Content-Type by default", async () => {
    const spy = mockFetch(201, { id: "p-x" });
    await pagesCreate({
      accessToken: TOK,
      sectionId: "sec-1",
      htmlBody: "<html><body>Hi</body></html>",
      contentType: "text/html",
    });
    const [, init] = spy.mock.calls[0]!;
    expect(
      init!.headers as Record<string, string>,
    ).toMatchObject({
      "Content-Type": "text/html",
    });
    expect(init!.body).toBe("<html><body>Hi</body></html>");
  });

  it("passes application/xhtml+xml Content-Type when requested", async () => {
    const spy = mockFetch(201, { id: "p-x" });
    await pagesCreate({
      accessToken: TOK,
      sectionId: "sec-1",
      htmlBody: "<p/>",
      contentType: "application/xhtml+xml",
    });
    expect(
      (spy.mock.calls[0]![1]!.headers as Record<string, string>)[
        "Content-Type"
      ],
    ).toBe("application/xhtml+xml");
  });
});

describe("pagesGet", () => {
  it("GETs /me/onenote/pages/{id}", async () => {
    const spy = mockFetch(200, { id: "p-1" });
    await pagesGet({ accessToken: TOK, pageId: "p-1" });
    expect(String(spy.mock.calls[0]![0])).toContain(
      "/me/onenote/pages/p-1",
    );
  });
});

describe("pageContentGet", () => {
  it("returns the raw HTML body as a string (not JSON-parsed)", async () => {
    mockFetch(200, "<html><body>Hello</body></html>");
    const result = await pageContentGet({ accessToken: TOK, pageId: "p-1" });
    expect(result.html).toBe("<html><body>Hello</body></html>");
  });

  it("adds includeIDs=true query param when requested", async () => {
    const spy = mockFetch(200, "<p/>");
    await pageContentGet({
      accessToken: TOK,
      pageId: "p-1",
      includeIDs: true,
    });
    expect(String(spy.mock.calls[0]![0])).toContain("includeIDs=true");
  });

  it("does NOT add includeIDs=false when default", async () => {
    const spy = mockFetch(200, "<p/>");
    await pageContentGet({ accessToken: TOK, pageId: "p-1" });
    expect(String(spy.mock.calls[0]![0])).not.toContain("includeIDs");
  });
});

describe("pageContentUpdate", () => {
  it("PATCHes operations array as JSON", async () => {
    const spy = mockFetch(204, "");
    await pageContentUpdate({
      accessToken: TOK,
      pageId: "p-1",
      operations: [
        { target: "body", action: "append", content: "<p>x</p>" },
      ],
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(init!.method).toBe("PATCH");
    expect(String(url)).toContain("/me/onenote/pages/p-1/content");
    expect(init!.body).toBe(
      JSON.stringify([{ target: "body", action: "append", content: "<p>x</p>" }]),
    );
  });

  it("resolves to undefined on 204 (no response body to parse)", async () => {
    mockFetch(204, "");
    await expect(
      pageContentUpdate({
        accessToken: TOK,
        pageId: "p-1",
        operations: [{ target: "body", action: "replace", content: "" }],
      }),
    ).resolves.toBeUndefined();
  });
});

describe("pagesDelete", () => {
  it("DELETEs /me/onenote/pages/{id}", async () => {
    const spy = mockFetch(204, "");
    await pagesDelete({ accessToken: TOK, pageId: "p-1" });
    const [url, init] = spy.mock.calls[0]!;
    expect(init!.method).toBe("DELETE");
    expect(String(url)).toContain("/me/onenote/pages/p-1");
  });

  it("throws NotFoundError on 404 (already deleted)", async () => {
    mockFetch(404, { error: { message: "not found" } });
    await expect(
      pagesDelete({ accessToken: TOK, pageId: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("pagesCopyToSection", () => {
  it("POSTs {id: targetSectionId} to /me/onenote/pages/{id}/copyToSection + returns operationLocation header", async () => {
    const spy = mockFetch(
      202,
      {},
      { headers: { "operation-location": "https://graph/operations/op-1" } },
    );
    const result = await pagesCopyToSection({
      accessToken: TOK,
      pageId: "p-1",
      targetSectionId: "sec-target",
    });
    expect(result.operationLocation).toBe(
      "https://graph/operations/op-1",
    );
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain("/me/onenote/pages/p-1/copyToSection");
    expect(init!.body).toBe(
      JSON.stringify({ id: "sec-target" }),
    );
  });

  it("falls back to the Location header (OneNote copyToSection returns the operation URL there, not Operation-Location) — SMOKE-WRITE-35", async () => {
    // Verified live: OneNote returns 202 with `Location` (no `Operation-Location`).
    mockFetch(202, {}, { headers: { location: "https://graph/operations/op-loc-1" } });
    const result = await pagesCopyToSection({
      accessToken: TOK,
      pageId: "p-1",
      targetSectionId: "sec-target",
    });
    expect(result.operationLocation).toBe("https://graph/operations/op-loc-1");
  });

  it("prefers Operation-Location when BOTH headers are present (spec/forward-compat)", async () => {
    mockFetch(202, {}, {
      headers: {
        "operation-location": "https://graph/operations/op-pref",
        location: "https://graph/operations/op-loc",
      },
    });
    const result = await pagesCopyToSection({
      accessToken: TOK,
      pageId: "p-1",
      targetSectionId: "sec-target",
    });
    expect(result.operationLocation).toBe("https://graph/operations/op-pref");
  });

  it("operationLocation null only when Graph omits BOTH headers", async () => {
    mockFetch(202, {});
    const result = await pagesCopyToSection({
      accessToken: TOK,
      pageId: "p-1",
      targetSectionId: "sec-target",
    });
    expect(result.operationLocation).toBeNull();
  });
});

describe("error sanitization (defense in depth, applied to a sample of wrappers)", () => {
  it("notebooksList error message does NOT contain the access token nor raw Graph body JSON", async () => {
    mockFetch(500, GRAPH_BODY_WITH_TOKEN_HINT);
    let thrown: unknown;
    try {
      await notebooksList({ accessToken: TOK });
    } catch (err) {
      thrown = err;
    }
    const msg = (thrown as Error).message;
    expect(msg).not.toContain(TOK);
    // Raw Graph JSON envelope should not leak into the surface message.
    expect(msg).not.toContain('"code":"InvalidRequest"');
  });

  it("pagesCreate error message on 500 is sanitized (no token)", async () => {
    mockFetch(500, { error: { message: "boom" } });
    let thrown: unknown;
    try {
      await pagesCreate({
        accessToken: TOK,
        sectionId: "s",
        htmlBody: "<p/>",
        contentType: "text/html",
      });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).not.toContain(TOK);
  });
});
