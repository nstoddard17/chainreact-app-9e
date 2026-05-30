/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockTempLink = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/filesGetTemporaryLink", () => ({
  filesGetTemporaryLink: (...a: unknown[]) => mockTempLink(...a),
}));

import { getTemporaryLink } from "@/integrations/dropbox/actions/getTemporaryLink";

/** Narrowed view of the signed_url FileRef arm for assertions. */
type SignedRefView = {
  kind: string;
  name: string;
  provider?: string;
  url?: string;
  expiresAt?: string;
};

function input(config: Record<string, unknown>) {
  const triggerEvent: TriggerEvent = {
    provider: "dropbox",
    eventType: "manual",
    eventId: "e",
    occurredAt: "2026-05-24T00:00:00Z",
    providerAccountId: "dbid:1",
    payload: {},
  };
  return { workflowId: "wf", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent };
}

beforeEach(() => {
  mockRefresh.mockReset();
  mockTempLink.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropbox get_temporary_link", () => {
  it("wraps the temp link in a FileRef(kind=signed_url) with an expiry", async () => {
    mockTempLink.mockResolvedValueOnce({
      link: "https://dl.dropboxusercontent.com/apitl/1/abc",
      metadata: { name: "a.txt", path_display: "/a.txt", size: 12 },
    });
    const res = await getTemporaryLink(input({ path: "/a.txt" }));
    const file = res.output.file as SignedRefView;
    expect(file.kind).toBe("signed_url");
    expect(file.name).toBe("a.txt");
    expect(file.provider).toBe("dropbox");
    expect(file.url).toBe("https://dl.dropboxusercontent.com/apitl/1/abc");
    expect(typeof file.expiresAt).toBe("string");
    // Expiry is in the future (~4h).
    expect(new Date(file.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    expect(res.output.name).toBe("a.txt");
    expect(res.output.path).toBe("/a.txt");
    expect(res.output.sizeBytes).toBe(12);
  });

  it("never echoes the link outside the FileRef.url (no top-level link field)", async () => {
    mockTempLink.mockResolvedValueOnce({
      link: "https://dl.dropboxusercontent.com/apitl/1/secret",
      metadata: { name: "a.txt" },
    });
    const res = await getTemporaryLink(input({ path: "/a.txt" }));
    // The only place the link lives is file.url (the FileRef contract).
    expect(res.output).not.toHaveProperty("temporaryLink");
    expect(res.output).not.toHaveProperty("link");
  });
});
