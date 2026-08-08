/**
 * @jest-environment node
 *
 * Tests for `app/api/integrations/picker-session/route.ts`
 * (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2).
 *
 * The route owns auth, picker-key validation, and the two HTTP-level security
 * guarantees (POST-only so a token never lands in a URL/history/referrer, and
 * `no-store` so it is never cached). Credential policy lives in the service and
 * is tested separately.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockCreatePickerSession = jest.fn();
jest.mock("@/services/integrations/pickerSession", () => ({
  createPickerSession: (...args: unknown[]) => mockCreatePickerSession(...args),
}));

import { POST } from "@/app/api/integrations/picker-session/route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/integrations/picker-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockCreatePickerSession.mockResolvedValue({
    ok: true,
    accessToken: "ya29.TOKEN",
    appId: "111",
    apiKey: "key",
    mimeType: "application/vnd.google-apps.spreadsheet",
  });
});

describe("POST /api/integrations/picker-session", () => {
  it("401s an unauthenticated caller without touching the credential service", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(post({ picker: "google-sheets:spreadsheet" }));

    expect(res.status).toBe(401);
    expect(mockCreatePickerSession).not.toHaveBeenCalled();
  });

  it("sets Cache-Control: no-store so the token is never cached", async () => {
    const res = await POST(post({ picker: "google-sheets:spreadsheet" }));
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("rejects an unknown picker key WITHOUT reaching the credential service", async () => {
    const res = await POST(post({ picker: "gmail:messages" }));
    const body = (await res.json()) as { ok: boolean; code: string };

    expect(body).toMatchObject({ ok: false, code: "PICKER_NOT_SUPPORTED" });
    expect(mockCreatePickerSession).not.toHaveBeenCalled();
  });

  it("rejects a missing picker key (cannot be coerced into a provider lookup)", async () => {
    const res = await POST(post({ workflowId: "wf-1" }));
    const body = (await res.json()) as { ok: boolean; code: string };

    expect(body).toMatchObject({ ok: false, code: "PICKER_NOT_SUPPORTED" });
    expect(mockCreatePickerSession).not.toHaveBeenCalled();
  });

  it("passes the session-derived userId (never a client-supplied one) plus workflow/node context", async () => {
    await POST(
      post({
        picker: "google-sheets:spreadsheet",
        workflowId: "wf-1",
        nodeId: "node-1",
        userId: "attacker-supplied",
      }),
    );

    expect(mockCreatePickerSession).toHaveBeenCalledWith({
      picker: "google-sheets:spreadsheet",
      userId: "user-1",
      workflowId: "wf-1",
      nodeId: "node-1",
    });
  });

  it("returns typed service failures as HTTP 200 + code (so the field can render recovery)", async () => {
    mockCreatePickerSession.mockResolvedValue({
      ok: false,
      code: "INTEGRATION_NOT_CONNECTED",
      message: "Connect your Google Sheets account to choose a file.",
    });

    const res = await POST(post({ picker: "google-sheets:spreadsheet" }));
    const body = (await res.json()) as { ok: boolean; code: string };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: false, code: "INTEGRATION_NOT_CONNECTED" });
  });

  it("handles a malformed body without throwing", async () => {
    const bad = new Request("http://localhost/api/integrations/picker-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(200);
    expect(mockCreatePickerSession).not.toHaveBeenCalled();
  });
});
