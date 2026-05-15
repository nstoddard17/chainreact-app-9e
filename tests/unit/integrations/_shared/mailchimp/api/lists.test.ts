/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `lists` (audiences) resource wrapper —
 * Slice 14 Commit 3.
 */
import {
  listCreate,
  listsList,
} from "@/integrations/_shared/mailchimp/api/lists";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(response: {
  ok: boolean;
  json?: unknown;
  status?: number;
  text?: string;
}) {
  const spy = jest.spyOn(globalThis, "fetch");
  const status = response.status ?? (response.ok ? 200 : 500);
  const body =
    response.text !== undefined
      ? response.text
      : JSON.stringify(response.json ?? {});
  spy.mockResolvedValueOnce(new Response(body, { status }));
  return spy;
}

const REQUIRED_BODY = {
  name: "Acme List",
  permission_reminder: "You signed up on acme.com",
  email_type_option: false,
  contact: {
    company: "Acme",
    address1: "123 Main St",
    city: "SF",
    state: "CA",
    zip: "94102",
    country: "US",
  },
  campaign_defaults: {
    from_name: "Acme",
    from_email: "hi@acme.com",
  },
};

describe("listCreate", () => {
  it("POSTs /lists with compliance + campaign defaults", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "abc123", name: "Acme List", web_id: 99 },
    });
    await listCreate({
      accessToken: "t",
      dc: "us21",
      name: REQUIRED_BODY.name,
      permissionReminder: REQUIRED_BODY.permission_reminder,
      emailTypeOption: REQUIRED_BODY.email_type_option,
      contact: REQUIRED_BODY.contact,
      campaignDefaults: REQUIRED_BODY.campaign_defaults,
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://us21.api.mailchimp.com/3.0/lists");
    expect(init!.method).toBe("POST");
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual(REQUIRED_BODY);
  });

  it("includes optional fields when supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "x" } });
    await listCreate({
      accessToken: "t",
      dc: "us21",
      name: REQUIRED_BODY.name,
      permissionReminder: REQUIRED_BODY.permission_reminder,
      emailTypeOption: REQUIRED_BODY.email_type_option,
      contact: REQUIRED_BODY.contact,
      campaignDefaults: REQUIRED_BODY.campaign_defaults,
      useArchiveBar: false,
      notifyOnSubscribe: "subs@acme.com",
      notifyOnUnsubscribe: "unsubs@acme.com",
      marketingPermissions: true,
      doubleOptin: true,
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect(body.use_archive_bar).toBe(false);
    expect(body.notify_on_subscribe).toBe("subs@acme.com");
    expect(body.notify_on_unsubscribe).toBe("unsubs@acme.com");
    expect(body.marketing_permissions).toBe(true);
    expect(body.double_optin).toBe(true);
  });

  it("omits optional fields from body when not supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "x" } });
    await listCreate({
      accessToken: "t",
      dc: "us21",
      name: REQUIRED_BODY.name,
      permissionReminder: REQUIRED_BODY.permission_reminder,
      emailTypeOption: REQUIRED_BODY.email_type_option,
      contact: REQUIRED_BODY.contact,
      campaignDefaults: REQUIRED_BODY.campaign_defaults,
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]![1]!).body as string,
    );
    expect("use_archive_bar" in body).toBe(false);
    expect("notify_on_subscribe" in body).toBe(false);
    expect("notify_on_unsubscribe" in body).toBe(false);
    expect("marketing_permissions" in body).toBe(false);
    expect("double_optin" in body).toBe(false);
  });
});

// ─── listsList (Mailchimp 2.1 Commit 3) ─────────────────────────────────────

describe("listsList", () => {
  it("GETs /lists with default count=100", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        lists: [{ id: "abc", name: "Acme" }],
        total_items: 1,
      },
    });
    await listsList({ accessToken: "t", dc: "us21" });
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("https://us21.api.mailchimp.com/3.0/lists?");
    expect(new URL(url).searchParams.get("count")).toBe("100");
  });

  it("clamps count at 100 when caller requests more", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { lists: [], total_items: 0 },
    });
    await listsList({ accessToken: "t", dc: "us21", count: 1000 });
    expect(new URL(fetchSpy.mock.calls[0]![0] as string).searchParams.get("count")).toBe("100");
  });

  it("forwards offset on the wire", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { lists: [], total_items: 0 },
    });
    await listsList({ accessToken: "t", dc: "us21", offset: 25 });
    expect(new URL(fetchSpy.mock.calls[0]![0] as string).searchParams.get("offset")).toBe("25");
  });

  it("returns { lists: [], totalItems: 0 } when response is absent", async () => {
    mockFetchOnce({ ok: true, json: {} });
    const result = await listsList({ accessToken: "t", dc: "us21" });
    expect(result).toEqual({ lists: [], totalItems: 0 });
  });

  it("returns parsed lists + totalItems on success", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        lists: [
          { id: "abc", name: "Acme", stats: { member_count: 42 }, date_created: "2026-01-01T00:00:00+00:00" },
          { id: "xyz", name: "Beta" },
        ],
        total_items: 2,
      },
    });
    const result = await listsList({ accessToken: "t", dc: "us21" });
    expect(result.lists.map((l) => l.id)).toEqual(["abc", "xyz"]);
    expect(result.totalItems).toBe(2);
  });

  it("routes through the per-dc origin (eu1 vs us21)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { lists: [], total_items: 0 },
    });
    await listsList({ accessToken: "t", dc: "eu1" });
    expect(fetchSpy.mock.calls[0]![0]).toContain("https://eu1.api.mailchimp.com/3.0/lists");
  });

  it("propagates 5xx errors", async () => {
    mockFetchOnce({ ok: false, status: 500, text: '{"detail":"oops"}' });
    await expect(listsList({ accessToken: "t", dc: "us21" })).rejects.toThrow();
  });
});
