/**
 * @jest-environment node
 *
 * Tests for app/api/providers/route.ts +
 * app/api/providers/[id]/actions/route.ts +
 * app/api/providers/[id]/triggers/route.ts.
 *
 * Mocks supabase auth at the createClient boundary. Lets the real
 * discovery registry + integration registry run — the registries are
 * pure modules with no network/DB and module-load Zod parsing
 * guarantees they're well-formed before any test runs.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import { GET as getProviders } from "@/app/api/providers/route";
import { GET as getActions } from "@/app/api/providers/[id]/actions/route";
import { GET as getTriggers } from "@/app/api/providers/[id]/triggers/route";

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

describe("GET /api/providers", () => {
  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await getProviders();
    expect(res.status).toBe(401);
  });

  it("includes native as a synthetic provider entry with hasMetadata=true", async () => {
    authedUser();
    const res = await getProviders();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const native = body.providers.find((p) => p.id === "native");
    expect(native).toBeDefined();
    expect(native?.hasMetadata).toBe(true);
  });

  it("includes the OAuth providers from the manifest registry", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string }>;
    };
    const ids = body.providers.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["slack", "gmail", "notion"]));
  });

  it("marks GitHub as hasMetadata=true now that Slice 3.0b shipped its metas", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const github = body.providers.find((p) => p.id === "github");
    expect(github).toBeDefined();
    expect(github?.hasMetadata).toBe(true);
  });

  it("marks providers without metadata yet (e.g. slack) as hasMetadata=false", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const slack = body.providers.find((p) => p.id === "slack");
    expect(slack).toBeDefined();
    expect(slack?.hasMetadata).toBe(false);
  });

  it("sorts providers by displayName", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ displayName: string }>;
    };
    const names = body.providers.map((p) => p.displayName);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

describe("GET /api/providers/[id]/actions", () => {
  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await getActions(new Request("http://x/native/actions"), {
      params: Promise.resolve({ id: "native" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the 5 native action metas", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/native/actions"), {
      params: Promise.resolve({ id: "native" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      actions: Array<{ key: string }>;
    };
    expect(body.provider).toBe("native");
    expect(body.actions).toHaveLength(5);
    expect(body.actions.map((a) => a.key)).toEqual(
      expect.arrayContaining([
        "native:http_request",
        "native:format_transformer",
        "native:delay",
        "native:if_then_condition",
        "native:router",
      ]),
    );
  });

  it("returns empty array for a manifest-registered provider with no metas yet", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/slack/actions"), {
      params: Promise.resolve({ id: "slack" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { actions: unknown[] };
    expect(body.actions).toEqual([]);
  });

  it("returns 404 PROVIDER_NOT_FOUND for an unknown provider id", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/ghost/actions"), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: "PROVIDER_NOT_FOUND" });
  });

  it("returns the 6 GitHub action metas in displayOrder", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/github/actions"), {
      params: Promise.resolve({ id: "github" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      actions: Array<{ key: string; requiresIntegration: boolean }>;
    };
    expect(body.provider).toBe("github");
    expect(body.actions).toHaveLength(6);
    expect(body.actions.map((a) => a.key)).toEqual([
      "github:create_issue",
      "github:create_repository",
      "github:create_pull_request",
      "github:create_branch",
      "github:create_gist",
      "github:add_comment",
    ]);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
  });
});

describe("GET /api/providers/[id]/triggers", () => {
  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const res = await getTriggers(new Request("http://x/native/triggers"), {
      params: Promise.resolve({ id: "native" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the 2 native trigger metas", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/native/triggers"), {
      params: Promise.resolve({ id: "native" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      triggers: Array<{ key: string }>;
    };
    expect(body.triggers).toHaveLength(2);
    expect(body.triggers.map((t) => t.key)).toEqual(
      expect.arrayContaining(["native:manual.run", "native:schedule.fired"]),
    );
  });

  it("returns 404 PROVIDER_NOT_FOUND for an unknown provider id", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/ghost/triggers"), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the GitHub new_commit trigger meta", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/github/triggers"), {
      params: Promise.resolve({ id: "github" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      triggers: Array<{ key: string; activation: string }>;
    };
    expect(body.triggers).toHaveLength(1);
    expect(body.triggers[0]).toMatchObject({
      key: "github:new_commit",
      activation: "webhook",
    });
  });
});
