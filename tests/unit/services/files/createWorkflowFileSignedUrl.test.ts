/**
 * @jest-environment node
 *
 * Unit tests for services/files/createWorkflowFileSignedUrl.ts.
 *
 * Supabase storage is mocked. The test never touches the network.
 * Asserts:
 *   - calls `createSignedUrl` on the canonical `workflow-files` bucket
 *   - passes the supplied storagePath + expiresIn (default 600s)
 *   - returns the signed URL + a derived ISO-8601 expiresAt
 *   - throws on storage error without leaking the storagePath or URL
 */

interface SignedUrlCall {
  bucket: string;
  path: string;
  expiresIn: number;
}

const signedUrlCalls: SignedUrlCall[] = [];
let nextSignedUrlResult: {
  data: { signedUrl: string } | null;
  error: { message: string } | null;
} = { data: { signedUrl: "https://signed.example/abc" }, error: null };

function makeMockSupabase() {
  return {
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl(path: string, expiresIn: number) {
            signedUrlCalls.push({ bucket, path, expiresIn });
            return Promise.resolve(nextSignedUrlResult);
          },
        };
      },
    },
  };
}

const mockSupabase: { current: ReturnType<typeof makeMockSupabase> | null } = {
  current: null,
};

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockSupabase.current),
}));

import { createWorkflowFileSignedUrl } from "@/services/files/createWorkflowFileSignedUrl";
import { WORKFLOW_FILES_BUCKET } from "@/core/files/fetchFileBytes";

beforeEach(() => {
  signedUrlCalls.length = 0;
  nextSignedUrlResult = {
    data: { signedUrl: "https://signed.example/abc" },
    error: null,
  };
  mockSupabase.current = makeMockSupabase();
});

describe("createWorkflowFileSignedUrl", () => {
  it("creates a signed URL on the workflow-files bucket using the supplied storagePath", async () => {
    const result = await createWorkflowFileSignedUrl({
      storagePath: "user-1/wf-1/run-1/node-1/photo.png",
      reason: "airtable:add_attachment run=run-1 node=node-1",
    });
    expect(signedUrlCalls).toHaveLength(1);
    expect(signedUrlCalls[0]!.bucket).toBe(WORKFLOW_FILES_BUCKET);
    expect(signedUrlCalls[0]!.path).toBe(
      "user-1/wf-1/run-1/node-1/photo.png",
    );
    expect(result.signedUrl).toBe("https://signed.example/abc");
  });

  it("defaults expiresIn to 600 seconds when omitted", async () => {
    await createWorkflowFileSignedUrl({
      storagePath: "u/w/r/n/f",
      reason: "x",
    });
    expect(signedUrlCalls[0]!.expiresIn).toBe(600);
  });

  it("threads a custom expiresIn through to Supabase", async () => {
    await createWorkflowFileSignedUrl({
      storagePath: "u/w/r/n/f",
      expiresIn: 60,
      reason: "x",
    });
    expect(signedUrlCalls[0]!.expiresIn).toBe(60);
  });

  it("returns an ISO-8601 expiresAt derived from now + expiresIn", async () => {
    const before = Date.now();
    const result = await createWorkflowFileSignedUrl({
      storagePath: "u/w/r/n/f",
      expiresIn: 300,
      reason: "x",
    });
    const expiresAtMs = Date.parse(result.expiresAt);
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 300 * 1000 - 50);
    expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + 300 * 1000 + 50);
  });

  it("throws on Supabase storage error", async () => {
    nextSignedUrlResult = {
      data: null,
      error: { message: "Bucket not found" },
    };
    await expect(
      createWorkflowFileSignedUrl({
        storagePath: "u/w/r/n/f",
        reason: "x",
      }),
    ).rejects.toThrow(/signed URL creation failed/);
  });

  it("throws on missing signedUrl in response (defensive)", async () => {
    nextSignedUrlResult = {
      data: null,
      error: null,
    };
    await expect(
      createWorkflowFileSignedUrl({
        storagePath: "u/w/r/n/f",
        reason: "x",
      }),
    ).rejects.toThrow(/signed URL creation failed/);
  });

  it("error message does NOT include the storagePath or any URL", async () => {
    nextSignedUrlResult = {
      data: null,
      error: { message: "permission denied" },
    };
    try {
      await createWorkflowFileSignedUrl({
        storagePath: "user-secret/wf-private/run-x/node-y/secret-file.pdf",
        reason: "x",
      });
      throw new Error("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      // No leak of storagePath.
      expect(msg).not.toContain("user-secret");
      expect(msg).not.toContain("secret-file.pdf");
      // No leak of any signed URL fragment.
      expect(msg).not.toContain("https://");
    }
  });
});
