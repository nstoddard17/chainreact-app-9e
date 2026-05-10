/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `webhooks` resource wrappers + duplicate-URL
 * recovery — Slice 14 Commit 4.
 *
 * Verifies:
 *   - `webhooksCreate` POSTs the events+sources bitmap with the URL.
 *   - `webhooksList` GETs and unwraps the `webhooks[]` field.
 *   - `webhooksDelete` DELETEs the per-webhook resource.
 *   - `webhooksPatch` PATCHes events/sources.
 *   - `webhooksCreateOrAdopt` happy path returns adopted=false.
 *   - `webhooksCreateOrAdopt` on duplicate-URL detects the V1 message
 *     pattern, lists existing webhooks, and PATCHes the match.
 *   - Adopted webhook returns adopted=true.
 *   - When Mailchimp reports duplicate but list returns no match,
 *     surface a clear error.
 *   - Non-duplicate errors propagate unchanged.
 */
import {
  webhooksCreate,
  webhooksCreateOrAdopt,
  webhooksDelete,
  webhooksList,
  webhooksPatch,
} from "@/integrations/_shared/mailchimp/api/webhooks";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchSequence(
  responses: Array<{
    ok: boolean;
    status?: number;
    json?: unknown;
    text?: string;
  }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const status = r.status ?? (r.ok ? 200 : 500);
    const body =
      status === 204
        ? null
        : r.text !== undefined
          ? r.text
          : JSON.stringify(r.json ?? {});
    spy.mockResolvedValueOnce(new Response(body, { status }));
  }
  return spy;
}

const AUDIENCE_ID = "1a2b3c4d5e";
const URL_PATH = `https://us21.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/webhooks`;
const ALL_FALSE_EVENTS = {
  subscribe: false,
  unsubscribe: false,
  profile: false,
  cleaned: false,
  upemail: false,
  campaign: false,
};
const ALL_SOURCES_TRUE = { user: true, admin: true, api: true };

// ─── webhooksCreate ─────────────────────────────────────────────────────────

describe("webhooksCreate", () => {
  it("POSTs to /lists/{audienceId}/webhooks with events+sources body", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          id: "wh-uuid-1",
          url: "https://app.example/api/webhooks/mailchimp?workflowId=w1&nodeId=n1",
          events: { ...ALL_FALSE_EVENTS, subscribe: true },
          sources: ALL_SOURCES_TRUE,
          list_id: AUDIENCE_ID,
        },
      },
    ]);
    await webhooksCreate({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      url: "https://app.example/api/webhooks/mailchimp?workflowId=w1&nodeId=n1",
      events: { ...ALL_FALSE_EVENTS, subscribe: true },
      sources: ALL_SOURCES_TRUE,
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(URL_PATH);
    expect(init!.method).toBe("POST");
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({
      url: "https://app.example/api/webhooks/mailchimp?workflowId=w1&nodeId=n1",
      events: { ...ALL_FALSE_EVENTS, subscribe: true },
      sources: ALL_SOURCES_TRUE,
    });
  });
});

// ─── webhooksList ───────────────────────────────────────────────────────────

describe("webhooksList", () => {
  it("GETs /lists/{audienceId}/webhooks and unwraps webhooks[]", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          webhooks: [
            { id: "wh1", url: "u1", events: ALL_FALSE_EVENTS, sources: ALL_SOURCES_TRUE },
            { id: "wh2", url: "u2", events: ALL_FALSE_EVENTS, sources: ALL_SOURCES_TRUE },
          ],
        },
      },
    ]);
    const result = await webhooksList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(URL_PATH);
    expect((fetchSpy.mock.calls[0]![1]!).method).toBe("GET");
    expect(result.map((w) => w.id)).toEqual(["wh1", "wh2"]);
  });

  it("returns [] when webhooks array is absent", async () => {
    mockFetchSequence([{ ok: true, json: {} }]);
    const result = await webhooksList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
    });
    expect(result).toEqual([]);
  });
});

// ─── webhooksDelete ─────────────────────────────────────────────────────────

describe("webhooksDelete", () => {
  it("DELETEs /lists/{audienceId}/webhooks/{webhookId} and resolves on 204", async () => {
    const fetchSpy = mockFetchSequence([{ ok: true, status: 204 }]);
    await expect(
      webhooksDelete({
        accessToken: "t",
        dc: "us21",
        audienceId: AUDIENCE_ID,
        webhookId: "wh-uuid-1",
      }),
    ).resolves.toBeUndefined();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${URL_PATH}/wh-uuid-1`);
    expect(init!.method).toBe("DELETE");
  });
});

// ─── webhooksPatch ──────────────────────────────────────────────────────────

describe("webhooksPatch", () => {
  it("PATCHes events+sources on the existing record", async () => {
    const newEvents = { ...ALL_FALSE_EVENTS, subscribe: true, upemail: true };
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: { id: "wh1", url: "u", events: newEvents, sources: ALL_SOURCES_TRUE },
      },
    ]);
    await webhooksPatch({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      webhookId: "wh1",
      events: newEvents,
      sources: ALL_SOURCES_TRUE,
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${URL_PATH}/wh1`);
    expect(init!.method).toBe("PATCH");
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ events: newEvents, sources: ALL_SOURCES_TRUE });
  });
});

// ─── webhooksCreateOrAdopt — happy path ─────────────────────────────────────

describe("webhooksCreateOrAdopt", () => {
  it("returns adopted=false when create succeeds", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          id: "wh-new",
          url: "u",
          events: { ...ALL_FALSE_EVENTS, subscribe: true },
          sources: ALL_SOURCES_TRUE,
        },
      },
    ]);
    const result = await webhooksCreateOrAdopt({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      url: "u",
      events: { ...ALL_FALSE_EVENTS, subscribe: true },
      sources: ALL_SOURCES_TRUE,
    });
    expect(result.adopted).toBe(false);
    expect(result.webhook.id).toBe("wh-new");
  });

  it("on duplicate-URL error: lists existing, PATCHes matching webhook, returns adopted=true", async () => {
    // First fetch: create → 400 with V1's "can't set up multiple WebHooks" string.
    // Second fetch: list → returns the existing webhook with matching URL.
    // Third fetch: patch → returns the patched webhook.
    const fetchSpy = mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: {
          type: "...",
          title: "Resource Conflict",
          detail:
            "Sorry, you can't set up multiple WebHooks for one URL on the same list.",
          errors: [
            {
              field: "url",
              message: "Sorry, you can't set up multiple WebHooks for one URL.",
            },
          ],
        },
      },
      {
        ok: true,
        json: {
          webhooks: [
            {
              id: "wh-other",
              url: "different-url",
              events: ALL_FALSE_EVENTS,
              sources: ALL_SOURCES_TRUE,
            },
            {
              id: "wh-existing",
              url: "https://app.example/api/webhooks/mailchimp?workflowId=w1&nodeId=n1",
              events: { ...ALL_FALSE_EVENTS, subscribe: false },
              sources: ALL_SOURCES_TRUE,
            },
          ],
        },
      },
      {
        ok: true,
        json: {
          id: "wh-existing",
          url: "https://app.example/api/webhooks/mailchimp?workflowId=w1&nodeId=n1",
          events: { ...ALL_FALSE_EVENTS, subscribe: true },
          sources: ALL_SOURCES_TRUE,
        },
      },
    ]);

    const result = await webhooksCreateOrAdopt({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      url: "https://app.example/api/webhooks/mailchimp?workflowId=w1&nodeId=n1",
      events: { ...ALL_FALSE_EVENTS, subscribe: true },
      sources: ALL_SOURCES_TRUE,
    });
    expect(result.adopted).toBe(true);
    expect(result.webhook.id).toBe("wh-existing");

    // Verify the PATCH call carried the requested events bitmap.
    const patchInit = fetchSpy.mock.calls[2]![1]!;
    expect(patchInit.method).toBe("PATCH");
    const patchBody = JSON.parse(patchInit.body as string);
    expect(patchBody.events.subscribe).toBe(true);
  });

  it("surfaces a clear error when Mailchimp reports duplicate but list returns no match", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: {
          detail: "can't set up multiple WebHooks",
        },
      },
      // List call: no matching url.
      {
        ok: true,
        json: { webhooks: [{ id: "wh-other", url: "different", events: ALL_FALSE_EVENTS, sources: ALL_SOURCES_TRUE }] },
      },
    ]);
    await expect(
      webhooksCreateOrAdopt({
        accessToken: "t",
        dc: "us21",
        audienceId: AUDIENCE_ID,
        url: "the-original-url",
        events: ALL_FALSE_EVENTS,
        sources: ALL_SOURCES_TRUE,
      }),
    ).rejects.toThrow(/duplicate-URL recovery failed/);
  });

  it("propagates non-duplicate create errors unchanged", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 422,
        json: { detail: "unrelated validation error" },
      },
    ]);
    await expect(
      webhooksCreateOrAdopt({
        accessToken: "t",
        dc: "us21",
        audienceId: AUDIENCE_ID,
        url: "u",
        events: ALL_FALSE_EVENTS,
        sources: ALL_SOURCES_TRUE,
      }),
    ).rejects.toThrow(/unrelated validation error/);
  });
});
