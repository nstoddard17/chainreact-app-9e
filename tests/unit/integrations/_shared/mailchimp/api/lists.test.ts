/**
 * @jest-environment node
 *
 * Tests for the Mailchimp `lists` (audiences) resource wrapper —
 * Slice 14 Commit 3.
 */
import { listCreate } from "@/integrations/_shared/mailchimp/api/lists";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(response: { ok: boolean; json?: unknown }) {
  const spy = jest.spyOn(globalThis, "fetch");
  spy.mockResolvedValueOnce(
    new Response(JSON.stringify(response.json ?? {}), {
      status: response.ok ? 200 : 500,
    }),
  );
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
