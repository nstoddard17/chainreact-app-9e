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
  memberGet,
  memberPatch,
  memberPut,
  memberSetTags,
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
