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

  it("marks Google Sheets as hasMetadata=true now that Slice 3.GSHEETS-3 shipped the first 8 action metas", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const gsheets = body.providers.find((p) => p.id === "google-sheets");
    expect(gsheets).toBeDefined();
    expect(gsheets?.hasMetadata).toBe(true);
  });

  it("marks HubSpot as hasMetadata=true now that Slice 3.HUBSPOT-3 shipped the first 6 action metas", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const hubspot = body.providers.find((p) => p.id === "hubspot");
    expect(hubspot).toBeDefined();
    expect(hubspot?.hasMetadata).toBe(true);
  });

  it("marks providers still without any metadata (e.g. airtable) as hasMetadata=false", async () => {
    authedUser();
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const airtable = body.providers.find((p) => p.id === "airtable");
    expect(airtable).toBeDefined();
    expect(airtable?.hasMetadata).toBe(false);
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

  it("returns the 6 HubSpot contact + company action metas in displayOrder as of Slice 3.HUBSPOT-3 (hubspot NOT yet in COVERED_PROVIDERS)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/hubspot/actions"), {
      params: Promise.resolve({ id: "hubspot" }),
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
        isDestructive: boolean;
        requiresConfirmation: boolean;
        riskLevel: string;
        riskDescription?: string;
        fields: Array<{
          name: string;
          type: string;
          required: boolean;
          defaultValue?: unknown;
          numeric?: { min?: number; max?: number; integer?: boolean };
          options?: Array<{ value: string; label: string }>;
        }>;
        outputs: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    expect(body.provider).toBe("hubspot");
    expect(body.actions).toHaveLength(6);
    expect(body.actions.map((a) => a.key)).toEqual([
      "hubspot:create_contact",
      "hubspot:update_contact",
      "hubspot:get_contacts",
      "hubspot:create_company",
      "hubspot:update_company",
      "hubspot:get_companies",
    ]);
    expect(body.actions.every((a) => a.category === "crm")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
    expect(body.actions.every((a) => a.producesFileRef === false)).toBe(true);
    expect(body.actions.every((a) => a.consumesFileRef === false)).toBe(true);

    // Risk classifications round-trip through the JSON serializer.
    for (const key of ["hubspot:create_contact", "hubspot:update_contact"]) {
      const action = body.actions.find((a) => a.key === key)!;
      expect(action.riskLevel).toBe("medium");
      expect(action.isDestructive).toBe(false);
      expect(action.requiresConfirmation).toBe(false);
      expect(typeof action.riskDescription).toBe("string");
      expect(action.riskDescription!.length).toBeGreaterThan(0);
    }
    for (const key of ["hubspot:get_contacts", "hubspot:get_companies"]) {
      const action = body.actions.find((a) => a.key === key)!;
      expect(action.riskLevel).toBe("low");
      expect(action.isDestructive).toBe(false);
    }

    // duplicateHandling select serializes its 3 options + defaultValue.
    const createContact = body.actions.find(
      (a) => a.key === "hubspot:create_contact",
    )!;
    const duplicateHandling = createContact.fields.find(
      (f) => f.name === "duplicateHandling",
    )!;
    expect(duplicateHandling.type).toBe("select");
    expect(duplicateHandling.required).toBe(true);
    expect(duplicateHandling.defaultValue).toBe("fail");
    expect(duplicateHandling.options!.map((o) => o.value).sort()).toEqual([
      "fail",
      "skip",
      "update",
    ]);

    // Sensitive flags round-trip for the CRM data outputs.
    expect(
      createContact.outputs.find((o) => o.name === "email")?.sensitive,
    ).toBe(true);
    expect(
      createContact.outputs.find((o) => o.name === "properties")?.sensitive,
    ).toBe(true);
    expect(
      createContact.outputs.find((o) => o.name === "contactId")?.sensitive,
    ).toBeFalsy();

    const getContacts = body.actions.find(
      (a) => a.key === "hubspot:get_contacts",
    )!;
    expect(
      getContacts.outputs.find((o) => o.name === "contacts")?.sensitive,
    ).toBe(true);
    expect(
      getContacts.outputs.find((o) => o.name === "hasMore")?.sensitive,
    ).toBeFalsy();

    // get_contacts.limit serializes its numeric bounds.
    const limit = getContacts.fields.find((f) => f.name === "limit")!;
    expect(limit.type).toBe("number");
    expect(limit.numeric?.min).toBe(1);
    expect(limit.numeric?.max).toBe(100);
    expect(limit.numeric?.integer).toBe(true);

    // Numeric-string company fields serialize as TEXT (not number).
    const createCompany = body.actions.find(
      (a) => a.key === "hubspot:create_company",
    )!;
    for (const fname of ["annualrevenue", "numberofemployees"]) {
      const f = createCompany.fields.find((x) => x.name === fname)!;
      expect(f.type).toBe("text");
    }
  });

  it("returns the full 12/12 Google Sheets action coverage in displayOrder as of Slice 3.GSHEETS-4 (google-sheets now in COVERED_PROVIDERS)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/google-sheets/actions"), {
      params: Promise.resolve({ id: "google-sheets" }),
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
        isDestructive: boolean;
        requiresConfirmation: boolean;
        riskLevel: string;
        riskDescription?: string;
        fields: Array<{
          name: string;
          type: string;
          optionsSource?: string;
          dependsOn?: string;
          required: boolean;
        }>;
        outputs: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    expect(body.provider).toBe("google-sheets");
    expect(body.actions).toHaveLength(12);
    expect(body.actions.map((a) => a.key)).toEqual([
      // Slice 3.GSHEETS-3 — read + simple-write.
      "google-sheets:read_rows",
      "google-sheets:get_cell_value",
      "google-sheets:get_sheet_metadata",
      "google-sheets:find_row",
      "google-sheets:create_spreadsheet",
      "google-sheets:append_row",
      "google-sheets:update_row",
      "google-sheets:update_cell",
      // Slice 3.GSHEETS-4 — destructive / bulk / formatting.
      "google-sheets:clear_range",
      "google-sheets:delete_row",
      "google-sheets:batch_update",
      "google-sheets:format_range",
    ]);
    expect(body.actions.every((a) => a.category === "data")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
    expect(body.actions.every((a) => a.producesFileRef === false)).toBe(true);
    expect(body.actions.every((a) => a.consumesFileRef === false)).toBe(true);

    // Resolver wiring round-trips through the JSON serializer — both
    // `google-sheets:spreadsheets` (every action except create_spreadsheet)
    // and `google-sheets:sheets` (sheetName-cascade actions) survive the
    // route layer.
    const readRows = body.actions.find(
      (a) => a.key === "google-sheets:read_rows",
    )!;
    const spreadsheetField = readRows.fields.find(
      (f) => f.name === "spreadsheetId",
    )!;
    expect(spreadsheetField.type).toBe("combobox");
    expect(spreadsheetField.optionsSource).toBe("google-sheets:spreadsheets");

    const getCellValue = body.actions.find(
      (a) => a.key === "google-sheets:get_cell_value",
    )!;
    const sheetField = getCellValue.fields.find((f) => f.name === "sheetName")!;
    expect(sheetField.type).toBe("combobox");
    expect(sheetField.optionsSource).toBe("google-sheets:sheets");
    expect(sheetField.dependsOn).toBe("spreadsheetId");

    // Sensitive flag round-trips for the 3 actions that expose cell content.
    expect(
      readRows.outputs.find((o) => o.name === "values")?.sensitive,
    ).toBe(true);
    expect(
      getCellValue.outputs.find((o) => o.name === "value")?.sensitive,
    ).toBe(true);
    const findRow = body.actions.find(
      (a) => a.key === "google-sheets:find_row",
    )!;
    expect(
      findRow.outputs.find((o) => o.name === "firstMatch")?.sensitive,
    ).toBe(true);
    expect(
      findRow.outputs.find((o) => o.name === "matches")?.sensitive,
    ).toBe(true);

    // Medium-risk write actions carry a riskDescription.
    for (const key of [
      "google-sheets:create_spreadsheet",
      "google-sheets:append_row",
      "google-sheets:update_row",
      "google-sheets:update_cell",
      "google-sheets:batch_update",
    ]) {
      const action = body.actions.find((a) => a.key === key)!;
      expect(action.riskLevel).toBe("medium");
      expect(typeof action.riskDescription).toBe("string");
      expect(action.riskDescription!.length).toBeGreaterThan(0);
    }

    // Slice 3.GSHEETS-4 destructive actions serialize the
    // isDestructive + requiresConfirmation + riskLevel:high tuple.
    for (const key of [
      "google-sheets:clear_range",
      "google-sheets:delete_row",
    ]) {
      const action = body.actions.find((a) => a.key === key)!;
      expect(action.riskLevel).toBe("high");
      expect(action.isDestructive).toBe(true);
      expect(action.requiresConfirmation).toBe(true);
      expect(typeof action.riskDescription).toBe("string");
      expect(action.riskDescription!.length).toBeGreaterThan(0);
    }

    // format_range stays low-risk despite being a write — formatting
    // is non-destructive of cell values.
    const formatRange = body.actions.find(
      (a) => a.key === "google-sheets:format_range",
    )!;
    expect(formatRange.riskLevel).toBe("low");
    expect(formatRange.isDestructive).toBe(false);
    expect(formatRange.requiresConfirmation).toBe(false);
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

  it("returns the 2 Google Sheets trigger metas registered in Slice 3.GSHEETS-4, all webhook-activated, with sensitive payload fields", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/google-sheets/triggers"), {
      params: Promise.resolve({ id: "google-sheets" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      triggers: Array<{
        key: string;
        activation: string;
        requiresIntegration: boolean;
        category: string;
        fields: Array<{
          name: string;
          type: string;
          optionsSource?: string;
          dependsOn?: string;
        }>;
        payloadShape: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    expect(body.provider).toBe("google-sheets");
    expect(body.triggers).toHaveLength(2);
    expect(body.triggers.map((t) => t.key)).toEqual([
      "google-sheets:new_worksheet",
      "google-sheets:row_changed",
    ]);
    expect(body.triggers.every((t) => t.activation === "webhook")).toBe(true);
    expect(body.triggers.every((t) => t.requiresIntegration === true)).toBe(true);
    expect(body.triggers.every((t) => t.category === "data")).toBe(true);

    // row_changed's sheetName cascade serializes correctly.
    const rowChanged = body.triggers.find(
      (t) => t.key === "google-sheets:row_changed",
    )!;
    const sheetField = rowChanged.fields.find((f) => f.name === "sheetName")!;
    expect(sheetField.type).toBe("combobox");
    expect(sheetField.optionsSource).toBe("google-sheets:sheets");
    expect(sheetField.dependsOn).toBe("spreadsheetId");

    // row_changed sensitive payload fields round-trip through JSON.
    expect(
      rowChanged.payloadShape.find((o) => o.name === "rowValues")?.sensitive,
    ).toBe(true);
    expect(
      rowChanged.payloadShape.find((o) => o.name === "keyValue")?.sensitive,
    ).toBe(true);
    // headers stays structural (column labels are like field names).
    expect(
      rowChanged.payloadShape.find((o) => o.name === "headers")?.sensitive,
    ).toBeFalsy();

    // new_worksheet payload is purely structural.
    const newWorksheet = body.triggers.find(
      (t) => t.key === "google-sheets:new_worksheet",
    )!;
    for (const o of newWorksheet.payloadShape) {
      expect(o.sensitive).toBeFalsy();
    }
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

// ─── Slice 3.POSTSEC-2 — sensitive flag serialization regression guards ────
describe("GET /api/providers/[id]/actions — sensitive flag for POSTSEC-2 drift cleanup", () => {
  it("stripe:find_payment_intent.paymentIntent is serialized with sensitive=true (and `found` stays unflagged)", async () => {
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
    const find = body.actions.find((a) => a.key === "stripe:find_payment_intent")!;
    expect(find.outputs.find((o) => o.name === "paymentIntent")?.sensitive).toBe(true);
    expect(find.outputs.find((o) => o.name === "found")?.sensitive).toBeFalsy();
  });

  it("gmail:search_emails.messages is serialized with sensitive=true (and `count`/`query` stay unflagged)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/gmail/actions"), {
      params: Promise.resolve({ id: "gmail" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        outputs: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    const search = body.actions.find((a) => a.key === "gmail:search_emails")!;
    expect(search.outputs.find((o) => o.name === "messages")?.sensitive).toBe(true);
    expect(search.outputs.find((o) => o.name === "count")?.sensitive).toBeFalsy();
    expect(search.outputs.find((o) => o.name === "query")?.sensitive).toBeFalsy();
  });

  it("slack:get_messages.messages is serialized with sensitive=true (and `hasMore`/`nextCursor` stay unflagged)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/slack/actions"), {
      params: Promise.resolve({ id: "slack" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        outputs: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    const gm = body.actions.find((a) => a.key === "slack:get_messages")!;
    expect(gm.outputs.find((o) => o.name === "messages")?.sensitive).toBe(true);
    expect(gm.outputs.find((o) => o.name === "hasMore")?.sensitive).toBeFalsy();
    expect(gm.outputs.find((o) => o.name === "nextCursor")?.sensitive).toBeFalsy();
  });

  it("notion:search.results is serialized with sensitive=true (and `hasMore`/`nextCursor` stay unflagged)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/notion/actions"), {
      params: Promise.resolve({ id: "notion" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        outputs: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    const search = body.actions.find((a) => a.key === "notion:search")!;
    expect(search.outputs.find((o) => o.name === "results")?.sensitive).toBe(true);
    expect(search.outputs.find((o) => o.name === "hasMore")?.sensitive).toBeFalsy();
    expect(search.outputs.find((o) => o.name === "nextCursor")?.sensitive).toBeFalsy();
  });
});

// ── Slice 3.POSTSEC-3 — requiresConfirmation serialization regression ─────
describe("GET /api/providers/[id]/actions — POSTSEC-3 requiresConfirmation flag serialization", () => {
  it("the 5 POSTSEC-3 Stripe actions serialize requiresConfirmation:true + isDestructive:false + riskLevel:high", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/stripe/actions"), {
      params: Promise.resolve({ id: "stripe" }),
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
    const KEYS = [
      "stripe:create_payment_intent",
      "stripe:confirm_payment_intent",
      "stripe:create_subscription",
      "stripe:update_subscription",
      "stripe:create_invoice",
    ];
    for (const key of KEYS) {
      const action = body.actions.find((a) => a.key === key);
      expect(action).toBeDefined();
      expect(action!.requiresConfirmation).toBe(true);
      expect(action!.isDestructive).toBe(false);
      expect(action!.riskLevel).toBe("high");
      expect(typeof action!.riskDescription).toBe("string");
      expect(action!.riskDescription!.length).toBeGreaterThan(0);
    }
  });

  it("the 3 Stripe destructive actions still serialize as isDestructive:true + requiresConfirmation:true (no regression from POSTSEC-3)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/stripe/actions"), {
      params: Promise.resolve({ id: "stripe" }),
    });
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        isDestructive: boolean;
        requiresConfirmation: boolean;
        riskLevel: string;
      }>;
    };
    for (const key of [
      "stripe:capture_payment_intent",
      "stripe:create_refund",
      "stripe:cancel_subscription",
    ]) {
      const action = body.actions.find((a) => a.key === key)!;
      expect(action.isDestructive).toBe(true);
      expect(action.requiresConfirmation).toBe(true);
      expect(action.riskLevel).toBe("high");
    }
  });

  it("medium/low Stripe actions still serialize requiresConfirmation:false (no accidental escalation)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/stripe/actions"), {
      params: Promise.resolve({ id: "stripe" }),
    });
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        isDestructive: boolean;
        requiresConfirmation: boolean;
      }>;
    };
    for (const key of [
      "stripe:create_customer",
      "stripe:update_customer",
      "stripe:create_checkout_session",
      "stripe:create_payment_link",
      "stripe:find_customer",
      "stripe:find_payment_intent",
      "stripe:find_subscription",
      "stripe:get_payments",
    ]) {
      const action = body.actions.find((a) => a.key === key)!;
      expect(action.requiresConfirmation).toBe(false);
      expect(action.isDestructive).toBe(false);
    }
  });
});
