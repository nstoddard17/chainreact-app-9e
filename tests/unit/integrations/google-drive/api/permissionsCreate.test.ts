/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — Drive permissions.create wrapper. Used by
 * google-docs:share_document and any future Drive sharing action.
 */
import { permissionsCreate } from "@/integrations/google-drive/api/permissionsCreate";
import { NotFoundError } from "@/integrations/google-drive/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const mockFetch = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  delete process.env.GOOGLE_DRIVE_API_BASE;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe("permissionsCreate — happy paths", () => {
  it("POSTs /drive/v3/files/{fileId}/permissions with user body + sendNotificationEmail query", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { id: "perm-1", type: "user", role: "reader", emailAddress: "a@e.com" }),
    );
    const result = await permissionsCreate({
      accessToken: "tok",
      fileId: "file-1",
      body: { type: "user", role: "reader", emailAddress: "a@e.com" },
      sendNotificationEmail: false,
    });
    expect(result.id).toBe("perm-1");
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toContain("/drive/v3/files/file-1/permissions");
    expect(String(url)).toContain("sendNotificationEmail=false");
    expect(String(url)).toContain("supportsAllDrives=true");
    expect(String(url)).not.toContain("transferOwnership");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      type: "user",
      role: "reader",
      emailAddress: "a@e.com",
    });
  });

  it("forwards emailMessage when supplied", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { id: "perm-1" }),
    );
    await permissionsCreate({
      accessToken: "tok",
      fileId: "f-1",
      body: {
        type: "user",
        role: "writer",
        emailAddress: "a@e.com",
        emailMessage: "FYI",
      },
      sendNotificationEmail: true,
    });
    const init = mockFetch.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string).emailMessage).toBe("FYI");
  });

  it("sets transferOwnership=true + moveToNewOwnersRoot=true in URL when requested", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: "perm-1" }));
    await permissionsCreate({
      accessToken: "tok",
      fileId: "f-1",
      body: { type: "user", role: "owner", emailAddress: "newowner@e.com" },
      sendNotificationEmail: true,
      transferOwnership: true,
      moveToNewOwnersRoot: true,
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(String(url)).toContain("transferOwnership=true");
    expect(String(url)).toContain("moveToNewOwnersRoot=true");
  });

  it("supports anyone-type with allowFileDiscovery (public share)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: "perm-2" }));
    await permissionsCreate({
      accessToken: "tok",
      fileId: "f-1",
      body: { type: "anyone", role: "reader", allowFileDiscovery: false },
      sendNotificationEmail: false,
    });
    const init = mockFetch.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toEqual({
      type: "anyone",
      role: "reader",
      allowFileDiscovery: false,
    });
  });

  it("url-encodes the fileId", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: "p-1" }));
    await permissionsCreate({
      accessToken: "tok",
      fileId: "file/with slash",
      body: { type: "anyone", role: "reader" },
      sendNotificationEmail: false,
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(String(url)).toContain(
      "/drive/v3/files/file%2Fwith%20slash/permissions",
    );
  });
});

describe("permissionsCreate — error mapping", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, {}));
    await expect(
      permissionsCreate({
        accessToken: "stale",
        fileId: "f-1",
        body: { type: "user", role: "reader", emailAddress: "a@e.com" },
        sendNotificationEmail: false,
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(404, { error: { code: 404, message: "File not found" } }),
    );
    await expect(
      permissionsCreate({
        accessToken: "tok",
        fileId: "missing",
        body: { type: "anyone", role: "reader" },
        sendNotificationEmail: false,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("surfaces Google error.message on other 4xx/5xx", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(403, {
        error: { code: 403, message: "Cannot transfer ownership to non-Workspace user" },
      }),
    );
    await expect(
      permissionsCreate({
        accessToken: "tok",
        fileId: "f-1",
        body: { type: "user", role: "owner", emailAddress: "out@example.com" },
        sendNotificationEmail: true,
        transferOwnership: true,
      }),
    ).rejects.toThrow(/Cannot transfer ownership/);
  });
});
