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

  it("marks Notion as hasMetadata=true now that Slice 3.41 shipped the page+database action metas", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const notion = body.providers.find((p) => p.id === "notion");
    expect(notion).toBeDefined();
    expect(notion?.hasMetadata).toBe(true);
  });

  it("marks Stripe as hasMetadata=true now that Slice 3.45 shipped the customer + payment lifecycle action metas", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const stripe = body.providers.find((p) => p.id === "stripe");
    expect(stripe).toBeDefined();
    expect(stripe?.hasMetadata).toBe(true);
  });

  it("marks providers still without any metadata (e.g. hubspot) as hasMetadata=false", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const hubspot = body.providers.find((p) => p.id === "hubspot");
    expect(hubspot).toBeDefined();
    expect(hubspot?.hasMetadata).toBe(false);
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

  it("returns the full 31/31 Slack action coverage as of Slice 3.38 (Slack is now in COVERED_PROVIDERS)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/slack/actions"), {
      params: Promise.resolve({ id: "slack" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      actions: Array<{
        key: string;
        category: string;
        requiresIntegration: boolean;
        producesFileRef: boolean;
        consumesFileRef: boolean;
      }>;
    };
    expect(body.provider).toBe("slack");
    expect(body.actions.map((a) => a.key)).toEqual([
      "slack:download_file",
      "slack:upload_file",
      "slack:send_channel_message",
      "slack:send_direct_message",
      "slack:update_message",
      "slack:delete_message",
      "slack:get_messages",
      "slack:get_thread_messages",
      "slack:schedule_message",
      "slack:cancel_scheduled_message",
      "slack:add_reaction",
      "slack:remove_reaction",
      "slack:pin_message",
      "slack:unpin_message",
      "slack:list_scheduled_messages",
      "slack:list_channels",
      "slack:get_channel_info",
      "slack:create_channel",
      "slack:archive_channel",
      "slack:unarchive_channel",
      "slack:rename_channel",
      "slack:join_channel",
      "slack:leave_channel",
      "slack:invite_users_to_channel",
      "slack:remove_user_from_channel",
      "slack:set_channel_topic",
      "slack:set_channel_purpose",
      "slack:get_user_info",
      "slack:list_users",
      "slack:get_file_info",
      "slack:post_interactive_blocks",
    ]);
    // Files surface: download_file produces FileRef; upload_file both
    // produces AND consumes; get_file_info produces FileRef.
    const byKey = new Map(body.actions.map((a) => [a.key, a]));
    const fileKeys = [
      "slack:download_file",
      "slack:upload_file",
      "slack:get_file_info",
    ];
    for (const key of fileKeys) {
      const action = byKey.get(key)!;
      expect(action.category).toBe("files");
      expect(action.requiresIntegration).toBe(true);
      expect(action.producesFileRef).toBe(true);
    }
    expect(byKey.get("slack:download_file")!.consumesFileRef).toBe(false);
    expect(byKey.get("slack:upload_file")!.consumesFileRef).toBe(true);
    expect(byKey.get("slack:get_file_info")!.consumesFileRef).toBe(false);
    // Every non-files action is category=messaging, integration-
    // required, no FileRef on either side.
    for (const action of body.actions) {
      if (fileKeys.includes(action.key)) continue;
      expect(action.category).toBe("messaging");
      expect(action.requiresIntegration).toBe(true);
      expect(action.producesFileRef).toBe(false);
      expect(action.consumesFileRef).toBe(false);
    }
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

  it("returns the full 16/16 Notion action coverage in displayOrder as of Slice 3.42 (Notion now in COVERED_PROVIDERS)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/notion/actions"), {
      params: Promise.resolve({ id: "notion" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      actions: Array<{
        key: string;
        category: string;
        requiresIntegration: boolean;
        producesFileRef: boolean;
        consumesFileRef: boolean;
      }>;
    };
    expect(body.provider).toBe("notion");
    expect(body.actions).toHaveLength(16);
    expect(body.actions.map((a) => a.key)).toEqual([
      // Slice 3.41 — pages + databases.
      "notion:create_page",
      "notion:update_page",
      "notion:archive_page",
      "notion:restore_page",
      "notion:get_page",
      "notion:create_database",
      "notion:create_database_entry",
      "notion:query_database",
      "notion:search",
      // Slice 3.42 — blocks + comments + users.
      "notion:append_block_children",
      "notion:get_block",
      "notion:get_block_children",
      "notion:create_comment",
      "notion:list_comments",
      "notion:get_user",
      "notion:list_users",
    ]);
    expect(body.actions.every((a) => a.category === "data")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
    expect(body.actions.every((a) => a.producesFileRef === false)).toBe(true);
    expect(body.actions.every((a) => a.consumesFileRef === false)).toBe(true);
  });

  it("returns the full 16/16 Stripe action coverage in displayOrder as of Slice 3.46 (Stripe now in COVERED_PROVIDERS)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/stripe/actions"), {
      params: Promise.resolve({ id: "stripe" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      actions: Array<{
        key: string;
        category: string;
        requiresIntegration: boolean;
        producesFileRef: boolean;
        consumesFileRef: boolean;
      }>;
    };
    expect(body.provider).toBe("stripe");
    expect(body.actions).toHaveLength(16);
    expect(body.actions.map((a) => a.key)).toEqual([
      // Slice 3.45 — customer + payment lifecycle.
      "stripe:create_customer",
      "stripe:update_customer",
      "stripe:find_customer",
      "stripe:create_payment_intent",
      "stripe:confirm_payment_intent",
      "stripe:capture_payment_intent",
      "stripe:create_refund",
      "stripe:find_payment_intent",
      // Slice 3.46 — subscriptions + commerce surfaces.
      "stripe:create_subscription",
      "stripe:update_subscription",
      "stripe:cancel_subscription",
      "stripe:find_subscription",
      "stripe:create_checkout_session",
      "stripe:create_payment_link",
      "stripe:create_invoice",
      "stripe:get_payments",
    ]);
    expect(body.actions.every((a) => a.category === "commerce")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
    expect(body.actions.every((a) => a.producesFileRef === false)).toBe(true);
    expect(body.actions.every((a) => a.consumesFileRef === false)).toBe(true);
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

// ─── Slice 3.SEC-2A — risk fields exposed on the actions endpoint ───────────
//
// The API surface for the builder MUST include the new risk metadata so the
// client can render warning chips, gate destructive drag-into-workflow, etc.
// These tests pin that the four fields are present on every action — both
// for high-risk Stripe actions AND for low-risk native ones (defaults).
describe("GET /api/providers/[id]/actions — risk fields in response (Slice 3.SEC-2A)", () => {
  it("returns riskLevel + isDestructive + requiresConfirmation on every native action (defaults applied)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/native/actions"), {
      params: Promise.resolve({ id: "native" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        isDestructive: boolean;
        requiresConfirmation: boolean;
        riskLevel: string;
        riskDescription?: string;
      }>;
    };
    for (const action of body.actions) {
      expect(typeof action.isDestructive).toBe("boolean");
      expect(typeof action.requiresConfirmation).toBe("boolean");
      expect(["low", "medium", "high"]).toContain(action.riskLevel);
    }
  });

  it("native:http_request returns riskLevel=high + a riskDescription explaining the egress concern", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/native/actions"), {
      params: Promise.resolve({ id: "native" }),
    });
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        riskLevel: string;
        isDestructive: boolean;
        requiresConfirmation: boolean;
        riskDescription?: string;
      }>;
    };
    const http = body.actions.find((a) => a.key === "native:http_request")!;
    expect(http).toBeDefined();
    expect(http.riskLevel).toBe("high");
    expect(http.isDestructive).toBe(false);
    expect(http.requiresConfirmation).toBe(false);
    expect(http.riskDescription).toBeDefined();
    expect(http.riskDescription!.length).toBeGreaterThan(0);
  });

  it("native:delay returns riskLevel=low with no riskDescription (defaults visible)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/native/actions"), {
      params: Promise.resolve({ id: "native" }),
    });
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        riskLevel: string;
        isDestructive: boolean;
        requiresConfirmation: boolean;
        riskDescription?: string;
      }>;
    };
    const delay = body.actions.find((a) => a.key === "native:delay")!;
    expect(delay).toBeDefined();
    expect(delay.riskLevel).toBe("low");
    expect(delay.isDestructive).toBe(false);
    expect(delay.requiresConfirmation).toBe(false);
    expect(delay.riskDescription).toBeUndefined();
  });

  it("stripe:create_refund returns the full destructive-confirmation tuple", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/stripe/actions"), {
      params: Promise.resolve({ id: "stripe" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        riskLevel: string;
        isDestructive: boolean;
        requiresConfirmation: boolean;
        riskDescription?: string;
      }>;
    };
    const refund = body.actions.find((a) => a.key === "stripe:create_refund")!;
    expect(refund).toBeDefined();
    expect(refund.riskLevel).toBe("high");
    expect(refund.isDestructive).toBe(true);
    expect(refund.requiresConfirmation).toBe(true);
    expect(refund.riskDescription).toBeDefined();
  });

  it("stripe:find_customer (read action) returns riskLevel=low and is not destructive", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/stripe/actions"), {
      params: Promise.resolve({ id: "stripe" }),
    });
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        riskLevel: string;
        isDestructive: boolean;
        requiresConfirmation: boolean;
      }>;
    };
    const find = body.actions.find((a) => a.key === "stripe:find_customer")!;
    expect(find).toBeDefined();
    expect(find.riskLevel).toBe("low");
    expect(find.isDestructive).toBe(false);
    expect(find.requiresConfirmation).toBe(false);
  });
});

// ─── Slice 3.SEC-7 — OutputMeta.sensitive in JSON response ──────────────────
describe("GET /api/providers/[id]/actions — sensitive flag on outputs (Slice 3.SEC-7)", () => {
  it("stripe:create_customer's email output is serialized with sensitive=true", async () => {
    // Slice 3.SEC-8 removed `clientSecret` from create_payment_intent's
    // output projection entirely (see `createPaymentIntent.ts` JSDoc),
    // so the original SEC-7 test was rewritten against a sensitive
    // output that still exists: customer email.
    authedUser();
    const res = await getActions(new Request("http://x/stripe/actions"), {
      params: Promise.resolve({ id: "stripe" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        outputs: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    const create = body.actions.find((a) => a.key === "stripe:create_customer")!;
    const email = create.outputs.find((o) => o.name === "email")!;
    expect(email.sensitive).toBe(true);
    // Non-sensitive sibling stays unflagged.
    const customerId = create.outputs.find((o) => o.name === "customerId")!;
    expect(customerId.sensitive).toBeFalsy();
  });

  it("stripe:create_payment_intent does NOT expose clientSecret in JSON (Slice 3.SEC-8 regression)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/stripe/actions"), {
      params: Promise.resolve({ id: "stripe" }),
    });
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        outputs: Array<{ name: string }>;
      }>;
    };
    const pi = body.actions.find((a) => a.key === "stripe:create_payment_intent")!;
    expect(pi.outputs.map((o) => o.name)).not.toContain("clientSecret");
  });

  it("stripe:confirm_payment_intent does NOT expose clientSecret in JSON (Slice 3.SEC-8 regression)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/stripe/actions"), {
      params: Promise.resolve({ id: "stripe" }),
    });
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        outputs: Array<{ name: string }>;
      }>;
    };
    const confirm = body.actions.find((a) => a.key === "stripe:confirm_payment_intent")!;
    expect(confirm.outputs.map((o) => o.name)).not.toContain("clientSecret");
  });

  it("native:http_request's body + bodyJson are serialized with sensitive=true", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/native/actions"), {
      params: Promise.resolve({ id: "native" }),
    });
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        outputs: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    const http = body.actions.find((a) => a.key === "native:http_request")!;
    expect(http.outputs.find((o) => o.name === "body")?.sensitive).toBe(true);
    expect(http.outputs.find((o) => o.name === "bodyJson")?.sensitive).toBe(true);
    // status / ok / urlHost stay unflagged.
    expect(http.outputs.find((o) => o.name === "status")?.sensitive).toBeFalsy();
    expect(http.outputs.find((o) => o.name === "ok")?.sensitive).toBeFalsy();
  });
});
