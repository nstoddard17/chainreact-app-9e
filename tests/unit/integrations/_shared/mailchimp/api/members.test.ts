/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `members` resource wrappers — Slice 14
 * Commit 3. Mocks `fetch` so we don't hit Mailchimp. Verifies:
 *   - URL construction with the subscriber-hash derivation
 *     (MD5(lowercase(email))).
 *   - HTTP method per endpoint (GET / PUT / PATCH / DELETE / POST).
 *   - Body shape per Mailchimp's documented contract for each
 *     endpoint.
 *   - Tag-set add/remove uses status='active'|'inactive' (NOT a
 *     separate endpoint).
 *   - 204 endpoints (archive / delete-permanent / tags / events)
 *     resolve void.
 *   - Per-dc URL routing flows through (`https://${dc}.api...`).
 */
import {
  memberAddEvent,
  memberAddNote,
  memberArchive,
  memberDeletePermanent,
  memberEventsList,
  memberGet,
  memberNotesList,
  memberPatch,
  memberPut,
  memberSetTags,
  membersList,
} from "@/integrations/_shared/mailchimp/api/members";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MAILCHIMP_API_BASE_OVERRIDE;
});

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const spy = jest.spyOn(globalThis, "fetch");
  const status = response.status ?? (response.ok ? 200 : 500);
  const body =
    status === 204
      ? null
      : response.text !== undefined
        ? response.text
        : JSON.stringify(response.json ?? {});
  spy.mockResolvedValueOnce(new Response(body, { status }));
  return spy;
}

// Pre-computed: md5(lowercase("urist@mcvankab.com")) hex.
const HASH_URIST = "41c00e62476865ba72254cdc5b2c191e";
const AUDIENCE_ID = "1a2b3c4d5e";

// ─── memberGet ──────────────────────────────────────────────────────────────

describe("memberGet", () => {
  it("GETs /lists/{audienceId}/members/{md5LowercaseEmail}", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: HASH_URIST,
        email_address: "urist@mcvankab.com",
        status: "subscribed",
        list_id: AUDIENCE_ID,
      },
    });
    const result = await memberGet({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      // Test case-insensitivity by passing mixed-case input.
      email: "Urist@MCVANKAB.com",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members/${HASH_URIST}`,
    );
    expect((fetchSpy.mock.calls[0]![1]!).method).toBe("GET");
    expect(result.status).toBe("subscribed");
  });
});

// ─── memberPut ──────────────────────────────────────────────────────────────

describe("memberPut", () => {
  it("PUTs the upsert body with status + status_if_new mirrored", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: HASH_URIST, email_address: "x@y.com", status: "pending" },
    });
    await memberPut({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      status: "pending",
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      email_address: "x@y.com",
      status_if_new: "pending",
      status: "pending",
    });
  });

  it("includes merge_fields when supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await memberPut({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      status: "subscribed",
      mergeFields: { FNAME: "Urist", LNAME: "McVankab" },
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.merge_fields).toEqual({ FNAME: "Urist", LNAME: "McVankab" });
  });

  it("includes tags as bare strings when supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await memberPut({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      status: "subscribed",
      tags: ["vip", "newsletter"],
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.tags).toEqual(["vip", "newsletter"]);
  });

  it("uses statusIfNew override when supplied (different from status)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await memberPut({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      status: "subscribed",
      statusIfNew: "pending",
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.status_if_new).toBe("pending");
    expect(body.status).toBe("subscribed");
  });

  it("omits merge_fields and tags from body when empty", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await memberPut({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      status: "subscribed",
      mergeFields: {},
      tags: [],
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect("merge_fields" in body).toBe(false);
    expect("tags" in body).toBe(false);
  });
});

// ─── memberPatch ────────────────────────────────────────────────────────────

describe("memberPatch", () => {
  it("PATCHes only the supplied fields (partial update)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: HASH_URIST, email_address: "x@y.com", status: "unsubscribed" },
    });
    await memberPatch({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      status: "unsubscribed",
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ status: "unsubscribed" });
  });

  it("supports email-change via newEmail field", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await memberPatch({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "old@y.com",
      newEmail: "new@y.com",
    });
    // URL still derives from the OLD email (the subscriber hash).
    expect(fetchSpy.mock.calls[0]![0]).toContain("/members/");
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body).toEqual({ email_address: "new@y.com" });
  });

  it("merges merge_fields when supplied alongside other changes", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await memberPatch({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      mergeFields: { PHONE: "+1-555-1212" },
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body).toEqual({ merge_fields: { PHONE: "+1-555-1212" } });
  });
});

// ─── memberArchive ──────────────────────────────────────────────────────────

describe("memberArchive", () => {
  it("DELETEs /lists/{id}/members/{hash} and resolves on 204", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, text: "" });
    await expect(
      memberArchive({
        accessToken: "t",
        dc: "us21",
        audienceId: AUDIENCE_ID,
        email: "urist@mcvankab.com",
      }),
    ).resolves.toBeUndefined();
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("DELETE");
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members/${HASH_URIST}`,
    );
  });
});

// ─── memberDeletePermanent ──────────────────────────────────────────────────

describe("memberDeletePermanent", () => {
  it("POSTs /actions/delete-permanent (NOT DELETE)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, text: "" });
    await memberDeletePermanent({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "urist@mcvankab.com",
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(init!.method).toBe("POST");
    expect(url).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members/${HASH_URIST}/actions/delete-permanent`,
    );
  });
});

// ─── memberSetTags ──────────────────────────────────────────────────────────

describe("memberSetTags", () => {
  it("POSTs /tags with the tags array and is_syncing: false by default", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, text: "" });
    await memberSetTags({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      tags: [{ name: "vip", status: "active" }],
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      tags: [{ name: "vip", status: "active" }],
      is_syncing: false,
    });
  });

  it("mixes active + inactive tags atomically (add + remove in one POST)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, text: "" });
    await memberSetTags({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      tags: [
        { name: "vip", status: "active" },
        { name: "newsletter", status: "inactive" },
      ],
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.tags).toEqual([
      { name: "vip", status: "active" },
      { name: "newsletter", status: "inactive" },
    ]);
  });

  it("honors isSyncing override", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, text: "" });
    await memberSetTags({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      tags: [{ name: "imported", status: "active" }],
      isSyncing: true,
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.is_syncing).toBe(true);
  });
});

// ─── memberAddNote ──────────────────────────────────────────────────────────

describe("memberAddNote", () => {
  it("POSTs /notes with the note body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: 12345, note: "Sample note", created_at: "2026-01-01T00:00:00+00:00" },
    });
    const result = await memberAddNote({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      note: "Sample note",
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ note: "Sample note" });
    expect(result.id).toBe(12345);
  });
});

// ─── memberAddEvent ─────────────────────────────────────────────────────────

describe("memberNotesList", () => {
  it("GETs /lists/{audienceId}/members/{hash}/notes with a bounded count", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { notes: [{ id: 1, note: "hi" }], total_items: 1 },
    });
    const result = await memberNotesList({
      accessToken: "tok",
      dc: "us1",
      audienceId: AUDIENCE_ID,
      email: "urist@mcvankab.com",
      count: 999,
    });
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain(`/lists/${AUDIENCE_ID}/members/${HASH_URIST}/notes`);
    expect(url).toContain("count=100");
    expect(result.notes).toEqual([{ id: 1, note: "hi" }]);
    expect(result.totalItems).toBe(1);
  });
});

describe("memberEventsList", () => {
  it("GETs /lists/{audienceId}/members/{hash}/events with a bounded count", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { events: [{ name: "crsmoke_ev" }], total_items: 1 },
    });
    const result = await memberEventsList({
      accessToken: "tok",
      dc: "us1",
      audienceId: AUDIENCE_ID,
      email: "urist@mcvankab.com",
    });
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain(`/lists/${AUDIENCE_ID}/members/${HASH_URIST}/events`);
    expect(url).toContain("count=100");
    expect(result.events).toEqual([{ name: "crsmoke_ev" }]);
    expect(result.totalItems).toBe(1);
  });
});

describe("memberAddEvent", () => {
  it("POSTs /events with name + is_syncing: false by default", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, text: "" });
    await memberAddEvent({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      name: "purchased_product",
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ name: "purchased_product", is_syncing: false });
  });

  it("includes properties + occurred_at when supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, text: "" });
    await memberAddEvent({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      email: "x@y.com",
      name: "purchased_product",
      properties: { product_id: "sku_42", amount: "99.99" },
      occurredAt: "2026-01-15T10:30:00Z",
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.properties).toEqual({
      product_id: "sku_42",
      amount: "99.99",
    });
    expect(body.occurred_at).toBe("2026-01-15T10:30:00Z");
  });
});

// ─── membersList (Mailchimp 2.1 Commit 1) ───────────────────────────────────

describe("membersList", () => {
  it("GETs /lists/{id}/members with default count=50 clamp", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { members: [{ id: "abc" }], total_items: 1 },
    });
    await membersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      `https://us21.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members?`,
    );
    const params = new URL(url).searchParams;
    expect(params.get("count")).toBe("50");
    // Default omits status / offset / sort fields.
    expect(params.get("status")).toBeNull();
    expect(params.get("offset")).toBeNull();
    expect(params.get("sort_field")).toBeNull();
  });

  it("forwards all query params on the wire", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { members: [], total_items: 0 },
    });
    await membersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      status: "subscribed",
      count: 25,
      offset: 50,
      sinceLastChanged: "2026-01-01T00:00:00Z",
      beforeLastChanged: "2026-02-01T00:00:00Z",
      sortField: "last_changed",
      sortDir: "DESC",
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    const params = new URL(url).searchParams;
    expect(params.get("status")).toBe("subscribed");
    expect(params.get("count")).toBe("25");
    expect(params.get("offset")).toBe("50");
    expect(params.get("since_last_changed")).toBe("2026-01-01T00:00:00Z");
    expect(params.get("before_last_changed")).toBe("2026-02-01T00:00:00Z");
    expect(params.get("sort_field")).toBe("last_changed");
    expect(params.get("sort_dir")).toBe("DESC");
  });

  it("clamps count at 100 even when caller requests more", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { members: [], total_items: 0 },
    });
    await membersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
      count: 1000,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(new URL(url).searchParams.get("count")).toBe("100");
  });

  it("returns { members: [], totalItems: 0 } when response array is absent", async () => {
    mockFetchOnce({ ok: true, json: {} });
    const result = await membersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
    });
    expect(result.members).toEqual([]);
    expect(result.totalItems).toBe(0);
  });

  it("returns parsed members + totalItems on success", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        members: [
          { id: "abc", email_address: "a@x.com", status: "subscribed", list_id: AUDIENCE_ID },
          { id: "def", email_address: "b@x.com", status: "unsubscribed", list_id: AUDIENCE_ID },
        ],
        total_items: 247,
      },
    });
    const result = await membersList({
      accessToken: "t",
      dc: "us21",
      audienceId: AUDIENCE_ID,
    });
    expect(result.members.map((m) => m.id)).toEqual(["abc", "def"]);
    expect(result.totalItems).toBe(247);
  });

  it("routes through the per-dc origin (us21 vs eu1)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { members: [], total_items: 0 },
    });
    await membersList({
      accessToken: "t",
      dc: "eu1",
      audienceId: AUDIENCE_ID,
    });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("https://eu1.api.mailchimp.com/3.0/lists/");
  });

  it("propagates errors (5xx)", async () => {
    mockFetchOnce({ ok: false, status: 500, text: '{"detail":"oops"}' });
    await expect(
      membersList({
        accessToken: "t",
        dc: "us21",
        audienceId: AUDIENCE_ID,
      }),
    ).rejects.toThrow();
  });
});
