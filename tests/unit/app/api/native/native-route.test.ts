/**
 * @jest-environment node
 *
 * Tests for app/api/native/actions/route.ts + app/api/native/triggers/route.ts.
 *
 * These routes are thin convenience wrappers that delegate to the same
 * registry accessors as /api/providers/native/*. The tests focus on the
 * route shape (URL + auth gate + response envelope) rather than
 * re-validating the meta content (covered in _registry.test.ts).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import { GET as getNativeActions } from "@/app/api/native/actions/route";
import { GET as getNativeTriggers } from "@/app/api/native/triggers/route";

beforeEach(() => {
  mockGetUser.mockReset();
});

function authedUser(): void {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
}

function unauthed(): void {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

describe("GET /api/native/actions", () => {
  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await getNativeActions();
    expect(res.status).toBe(401);
  });

  it("returns the 5 native action metas with provider='native'", async () => {
    authedUser();
    const res = await getNativeActions();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      actions: Array<{ key: string }>;
    };
    expect(body.provider).toBe("native");
    expect(body.actions).toHaveLength(5);
  });
});

describe("GET /api/native/triggers", () => {
  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await getNativeTriggers();
    expect(res.status).toBe(401);
  });

  it("returns the 2 native trigger metas", async () => {
    authedUser();
    const res = await getNativeTriggers();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      triggers: Array<{ key: string }>;
    };
    expect(body.triggers).toHaveLength(2);
  });
});
