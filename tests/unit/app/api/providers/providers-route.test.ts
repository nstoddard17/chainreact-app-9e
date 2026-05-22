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

  it("marks Slack as hasMetadata=true now that Slice 3.11 shipped its trigger metas", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const slack = body.providers.find((p) => p.id === "slack");
    expect(slack).toBeDefined();
    expect(slack?.hasMetadata).toBe(true);
  });

  it("marks Gmail as hasMetadata=true now that Slice 3.12 shipped its trigger metas", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const gmail = body.providers.find((p) => p.id === "gmail");
    expect(gmail).toBeDefined();
    expect(gmail?.hasMetadata).toBe(true);
  });

  it("marks Microsoft Outlook as hasMetadata=true now that Slice 3.17 shipped its action+trigger metas", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const outlook = body.providers.find((p) => p.id === "microsoft-outlook");
    expect(outlook).toBeDefined();
    expect(outlook?.hasMetadata).toBe(true);
  });

  it("marks providers without metadata yet (e.g. notion) as hasMetadata=false", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const notion = body.providers.find((p) => p.id === "notion");
    expect(notion).toBeDefined();
    expect(notion?.hasMetadata).toBe(false);
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

  it("returns empty array for a provider with trigger metas but no action metas (e.g. slack after Slice 3.11)", async () => {
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

  it("returns the 13 Gmail action metas registered in Slice 3.15, all email category + requiresIntegration", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/gmail/actions"), {
      params: Promise.resolve({ id: "gmail" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      actions: Array<{ key: string; category: string; requiresIntegration: boolean }>;
    };
    expect(body.provider).toBe("gmail");
    expect(body.actions).toHaveLength(13);
    expect(body.actions.map((a) => a.key)).toEqual([
      "gmail:send_email",
      "gmail:reply_to_email",
      "gmail:create_draft",
      "gmail:create_draft_reply",
      "gmail:search_emails",
      "gmail:get_attachment",
      "gmail:add_label",
      "gmail:remove_label",
      "gmail:create_label",
      "gmail:mark_as_read",
      "gmail:mark_as_unread",
      "gmail:archive_email",
      "gmail:delete_email",
    ]);
    expect(body.actions.every((a) => a.category === "email")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
  });

  it("returns the 9 Microsoft Outlook action metas registered in Slice 3.17, all email category + requiresIntegration", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/microsoft-outlook/actions"), {
      params: Promise.resolve({ id: "microsoft-outlook" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      actions: Array<{ key: string; category: string; requiresIntegration: boolean }>;
    };
    expect(body.provider).toBe("microsoft-outlook");
    expect(body.actions).toHaveLength(9);
    expect(body.actions.map((a) => a.key)).toEqual([
      "microsoft-outlook:send_email",
      "microsoft-outlook:reply_to_email",
      "microsoft-outlook:forward_email",
      "microsoft-outlook:create_draft_email",
      "microsoft-outlook:fetch_emails",
      "microsoft-outlook:get_attachment",
      "microsoft-outlook:add_categories",
      "microsoft-outlook:move_email",
      "microsoft-outlook:delete_email",
    ]);
    expect(body.actions.every((a) => a.category === "email")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
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

  it("returns the 3 Gmail trigger metas registered in Slice 3.12, all polling-activated", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/gmail/triggers"), {
      params: Promise.resolve({ id: "gmail" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      triggers: Array<{ key: string; activation: string; requiresIntegration: boolean }>;
    };
    expect(body.provider).toBe("gmail");
    expect(body.triggers).toHaveLength(3);
    expect(body.triggers.map((t) => t.key)).toEqual([
      "gmail:new_email",
      "gmail:new_labeled_email",
      "gmail:new_attachment",
    ]);
    expect(body.triggers.every((t) => t.activation === "polling")).toBe(true);
    expect(body.triggers.every((t) => t.requiresIntegration === true)).toBe(true);
  });

  it("returns the 10 Slack trigger metas registered in Slice 3.11, all webhook-activated", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/slack/triggers"), {
      params: Promise.resolve({ id: "slack" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      triggers: Array<{ key: string; activation: string; requiresIntegration: boolean }>;
    };
    expect(body.provider).toBe("slack");
    expect(body.triggers).toHaveLength(10);
    expect(body.triggers.map((t) => t.key)).toEqual([
      "slack:message.channel",
      "slack:message.im",
      "slack:message.group",
      "slack:message.mpim",
      "slack:reaction_added",
      "slack:reaction_removed",
      "slack:channel_created",
      "slack:member_joined_channel",
      "slack:member_left_channel",
      "slack:file_shared",
    ]);
    expect(body.triggers.every((t) => t.activation === "webhook")).toBe(true);
    expect(body.triggers.every((t) => t.requiresIntegration === true)).toBe(true);
  });

  it("returns the 3 Microsoft Outlook trigger metas registered in Slice 3.17, all webhook-activated", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/microsoft-outlook/triggers"), {
      params: Promise.resolve({ id: "microsoft-outlook" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      triggers: Array<{ key: string; activation: string; requiresIntegration: boolean }>;
    };
    expect(body.provider).toBe("microsoft-outlook");
    expect(body.triggers).toHaveLength(3);
    expect(body.triggers.map((t) => t.key)).toEqual([
      "microsoft-outlook:new_email",
      "microsoft-outlook:email_sent",
      "microsoft-outlook:email_flagged",
    ]);
    expect(body.triggers.every((t) => t.activation === "webhook")).toBe(true);
    expect(body.triggers.every((t) => t.requiresIntegration === true)).toBe(true);
  });
});
