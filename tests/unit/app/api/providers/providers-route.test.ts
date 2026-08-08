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
import { listProviders } from "@/integrations/_registry";
import { listProvidersWithMetadata } from "@/services/discovery/_registry";

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

  // TEST-REDUNDANCY-REMOVAL-1 — one registry-driven contract replaces the 20
  // per-provider "marks <X> as hasMetadata=true now that Slice N shipped"
  // markers. Those were historical landing notices: identical in body, each
  // naming one provider, and collectively a manually maintained list that a
  // newly added provider was never added to. This sweep derives its
  // expectations from the SAME production registries the route reads, so a
  // new provider is covered the moment it registers metadata — and the
  // serialization (not the registry) is what is under test.
  it("serializes hasMetadata from the discovery registry for every provider — no manual list", async () => {
    authedUser();
    const res = await getProviders();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };

    const withMetadata = new Set(listProvidersWithMetadata());
    const manifestIds = listProviders().map((m) => m.id);

    // Fail-closed floors: an empty registry (or an empty response) would make
    // every per-provider expectation below vacuously true.
    expect(withMetadata.size).toBeGreaterThan(10);
    expect(body.providers.length).toBeGreaterThanOrEqual(manifestIds.length);

    // Every manifest provider is serialized — the route never silently drops
    // one — and its hasMetadata mirrors the registry exactly.
    for (const id of manifestIds) {
      const entry = body.providers.find((p) => p.id === id);
      expect(entry).toBeDefined();
      expect(entry!.hasMetadata).toBe(withMetadata.has(id));
    }

    // Both polarities are actually exercised, so this can never pass by
    // every provider happening to be true.
    const trueIds = body.providers.filter((p) => p.hasMetadata).map((p) => p.id);
    const falseIds = body.providers.filter((p) => !p.hasMetadata).map((p) => p.id);
    expect(trueIds.length).toBeGreaterThan(10);
    expect(falseIds.length).toBeGreaterThan(0);
    // Concrete anchors for the true side (previously asserted one test each).
    expect(trueIds).toEqual(expect.arrayContaining(["gmail", "slack", "stripe"]));
    // ...and the false side is a real provider that has not shipped metas.
    for (const id of falseIds) {
      expect(withMetadata.has(id)).toBe(false);
    }
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













  // Slice 4.OUTLOOK-CAL-META-2 (final launch-gap provider) closed the
  // launch-gap tracker — `microsoft-outlook-calendar` flipped to
  // hasMetadata=true. The prior "name a still-pending launch-scope
  // provider" assertion is RETIRED rather than relocated to a deferred
  // surface: per the OUTLOOK-CAL-META-1 plan §10 closeout reminder,
  // "26/26 covered" ≠ "provider foundation fully complete," but the
  // remaining backlog (Stripe event_received TriggerMeta, Discord /
  // Docs / OneNote / Monday / Dropbox / Facebook triggers, deferred
  // resolvers across GCal / GDrive / Teams / OneDrive) lives in distinct
  // arc plans and shouldn't be inlined here as a single example. The
  // positive `microsoft-outlook-calendar hasMetadata=true` assertion
  // below replaces this block.




  it("exposes Stripe event_received TriggerMeta now that Slice 4.STRIPE-TRIGGER-META-2 shipped (closes PROVIDER-AUDIT-1's launch blocker — Stripe failed-payment → Slack DM is catalog-grounded)", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/stripe/triggers"), {
      params: Promise.resolve({ id: "stripe" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      triggers: Array<{ key: string; activation: string }>;
    };
    expect(body.provider).toBe("stripe");
    expect(body.triggers.map((t) => t.key)).toContain("stripe:event_received");
    const trigger = body.triggers.find((t) => t.key === "stripe:event_received")!;
    expect(trigger.activation).toBe("webhook");
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

  it("returns the 15 Gmail action metas (Slice 3.15 + list_labels/get_profile), all email category + requiresIntegration", async () => {
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
    expect(body.actions).toHaveLength(15);
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
      "gmail:list_labels",
      "gmail:get_profile",
    ]);
    expect(body.actions.every((a) => a.category === "email")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
  });

  it("returns the 11 Microsoft Outlook action metas (Slice 3.17 + list_folders/get_profile), all email category + requiresIntegration", async () => {
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
    expect(body.actions).toHaveLength(11);
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
      "microsoft-outlook:list_folders",
      "microsoft-outlook:get_profile",
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

  it("returns the full 26 HubSpot action metas in displayOrder as of Slice 3.HUBSPOT-5 (closes the action surface; hubspot NOT yet in COVERED_PROVIDERS — trigger meta pending in HUBSPOT-6)", async () => {
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
          optionsSource?: string;
          resourcePicker?: string;
          allowManualEntry?: boolean;
          dependsOn?: string;
          numeric?: { min?: number; max?: number; integer?: boolean };
          options?: Array<{ value: string; label: string }>;
        }>;
        outputs: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    expect(body.provider).toBe("hubspot");
    expect(body.actions).toHaveLength(26);
    expect(body.actions.map((a) => a.key)).toEqual([
      // Slice 3.HUBSPOT-3 — contacts + companies (10..60).
      "hubspot:create_contact",
      "hubspot:update_contact",
      "hubspot:get_contacts",
      "hubspot:create_company",
      "hubspot:update_company",
      "hubspot:get_companies",
      // Slice 3.HUBSPOT-4 — deals + tickets + owners-read (70..130).
      "hubspot:create_deal",
      "hubspot:update_deal",
      "hubspot:get_deals",
      "hubspot:create_ticket",
      "hubspot:update_ticket",
      "hubspot:get_tickets",
      "hubspot:get_owners",
      // Slice 3.HUBSPOT-5 — engagements + lists + commerce (140..260).
      "hubspot:create_note",
      "hubspot:create_task",
      "hubspot:create_call",
      "hubspot:create_meeting",
      "hubspot:add_contact_to_list",
      "hubspot:remove_from_list",
      "hubspot:create_product",
      "hubspot:update_product",
      "hubspot:get_products",
      "hubspot:create_line_item",
      "hubspot:update_line_item",
      "hubspot:get_line_items",
      "hubspot:remove_line_item",
    ]);
    expect(body.actions.every((a) => a.category === "crm")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
    expect(body.actions.every((a) => a.producesFileRef === false)).toBe(true);
    expect(body.actions.every((a) => a.consumesFileRef === false)).toBe(true);

    // Risk classifications round-trip through the JSON serializer.
    for (const key of [
      "hubspot:create_contact",
      "hubspot:update_contact",
      "hubspot:create_deal",
      "hubspot:update_deal",
      "hubspot:create_ticket",
      "hubspot:update_ticket",
    ]) {
      const action = body.actions.find((a) => a.key === key)!;
      expect(action.riskLevel).toBe("medium");
      expect(action.isDestructive).toBe(false);
      expect(action.requiresConfirmation).toBe(false);
      expect(typeof action.riskDescription).toBe("string");
      expect(action.riskDescription!.length).toBeGreaterThan(0);
    }
    for (const key of [
      "hubspot:get_contacts",
      "hubspot:get_companies",
      "hubspot:get_deals",
      "hubspot:get_tickets",
      "hubspot:get_owners",
    ]) {
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

    // ─── HUBSPOT-4 wire-shape pins ───────────────────────────────────────
    //
    // Pipeline → stage cascade serializes correctly on create_deal +
    // create_ticket, owners resolver wiring round-trips, sensitive
    // flags survive the JSON layer.

    const createDeal = body.actions.find(
      (a) => a.key === "hubspot:create_deal",
    )!;
    const dealPipeline = createDeal.fields.find((f) => f.name === "pipeline")!;
    expect(dealPipeline.type).toBe("combobox");
    expect(dealPipeline.optionsSource).toBe("hubspot:deal_pipelines");
    expect(dealPipeline.required).toBe(false);
    const dealStage = createDeal.fields.find((f) => f.name === "dealstage")!;
    expect(dealStage.type).toBe("combobox");
    expect(dealStage.optionsSource).toBe("hubspot:deal_stages");
    expect(dealStage.dependsOn).toBe("pipeline");
    expect(dealStage.required).toBe(true);
    const dealOwner = createDeal.fields.find(
      (f) => f.name === "hubspot_owner_id",
    )!;
    expect(dealOwner.type).toBe("combobox");
    expect(dealOwner.optionsSource).toBe("hubspot:owners");
    // amount is TEXT (HubSpot expects numeric strings).
    const dealAmount = createDeal.fields.find((f) => f.name === "amount")!;
    expect(dealAmount.type).toBe("text");
    // Sensitive deal outputs round-trip.
    expect(
      createDeal.outputs.find((o) => o.name === "dealname")?.sensitive,
    ).toBe(true);
    expect(
      createDeal.outputs.find((o) => o.name === "amount")?.sensitive,
    ).toBe(true);
    expect(
      createDeal.outputs.find((o) => o.name === "properties")?.sensitive,
    ).toBe(true);
    expect(
      createDeal.outputs.find((o) => o.name === "dealId")?.sensitive,
    ).toBeFalsy();

    const createTicket = body.actions.find(
      (a) => a.key === "hubspot:create_ticket",
    )!;
    const ticketPipeline = createTicket.fields.find(
      (f) => f.name === "hs_pipeline",
    )!;
    expect(ticketPipeline.type).toBe("combobox");
    expect(ticketPipeline.optionsSource).toBe("hubspot:ticket_pipelines");
    expect(ticketPipeline.required).toBe(true);
    const ticketStage = createTicket.fields.find(
      (f) => f.name === "hs_pipeline_stage",
    )!;
    expect(ticketStage.type).toBe("combobox");
    expect(ticketStage.optionsSource).toBe("hubspot:ticket_stages");
    expect(ticketStage.dependsOn).toBe("hs_pipeline");
    expect(ticketStage.required).toBe(true);
    const priority = createTicket.fields.find(
      (f) => f.name === "hs_ticket_priority",
    )!;
    expect(priority.type).toBe("select");
    expect(priority.defaultValue).toBeUndefined();
    expect(priority.options!.map((o) => o.value)).toEqual([
      "LOW",
      "MEDIUM",
      "HIGH",
    ]);
    // Sensitive ticket outputs round-trip.
    expect(
      createTicket.outputs.find((o) => o.name === "subject")?.sensitive,
    ).toBe(true);
    expect(
      createTicket.outputs.find((o) => o.name === "properties")?.sensitive,
    ).toBe(true);
    expect(
      createTicket.outputs.find((o) => o.name === "ticketId")?.sensitive,
    ).toBeFalsy();

    // get_owners surface.
    const getOwners = body.actions.find(
      (a) => a.key === "hubspot:get_owners",
    )!;
    expect(getOwners.fields.map((f) => f.name)).toEqual([
      "limit",
      "email",
      "after",
    ]);
    const ownersLimit = getOwners.fields.find((f) => f.name === "limit")!;
    expect(ownersLimit.type).toBe("number");
    expect(ownersLimit.numeric?.min).toBe(1);
    expect(ownersLimit.numeric?.max).toBe(100);
    expect(
      getOwners.outputs.find((o) => o.name === "owners")?.sensitive,
    ).toBe(true);
    expect(
      getOwners.outputs.find((o) => o.name === "hasMore")?.sensitive,
    ).toBeFalsy();

    // ─── HUBSPOT-5 wire-shape pins ───────────────────────────────────────
    //
    // Risk classifications across the engagement + list + commerce
    // surface serialize correctly; remove_line_item carries the full
    // destructive trio; list pickers serialize the `hubspot:lists`
    // resolver wiring; create_task select defaults survive the JSON
    // layer.

    // Medium risk across the 10 HUBSPOT-5 write actions.
    for (const key of [
      "hubspot:create_note",
      "hubspot:create_task",
      "hubspot:create_call",
      "hubspot:create_meeting",
      "hubspot:add_contact_to_list",
      "hubspot:remove_from_list",
      "hubspot:create_product",
      "hubspot:update_product",
      "hubspot:create_line_item",
      "hubspot:update_line_item",
    ]) {
      const action = body.actions.find((a) => a.key === key)!;
      expect(action.riskLevel).toBe("medium");
      expect(action.isDestructive).toBe(false);
      expect(action.requiresConfirmation).toBe(false);
      expect(typeof action.riskDescription).toBe("string");
      expect(action.riskDescription!.length).toBeGreaterThan(0);
    }

    // Low risk on the HUBSPOT-5 reads.
    for (const key of ["hubspot:get_products", "hubspot:get_line_items"]) {
      const action = body.actions.find((a) => a.key === key)!;
      expect(action.riskLevel).toBe("low");
      expect(action.isDestructive).toBe(false);
      expect(action.requiresConfirmation).toBe(false);
    }

    // remove_line_item — sole destructive HubSpot action.
    const removeLineItem = body.actions.find(
      (a) => a.key === "hubspot:remove_line_item",
    )!;
    expect(removeLineItem.riskLevel).toBe("high");
    expect(removeLineItem.isDestructive).toBe(true);
    expect(removeLineItem.requiresConfirmation).toBe(true);
    expect(typeof removeLineItem.riskDescription).toBe("string");
    expect(removeLineItem.riskDescription!.length).toBeGreaterThan(0);
    // Narrow field + output shape — single required text id, narrow
    // structural outputs (neither sensitive).
    expect(removeLineItem.fields.map((f) => f.name)).toEqual(["lineItemId"]);
    // RESOLVERS-1 — the line-item id is a record-search picker (manual entry
    // preserved) rather than a paste-the-internal-id text field.
    expect(removeLineItem.fields[0]!.type).toBe("combobox");
    expect(removeLineItem.fields[0]!.optionsSource).toBe("hubspot:line_items");
    expect(removeLineItem.fields[0]!.allowManualEntry).toBe(true);
    expect(removeLineItem.fields[0]!.required).toBe(true);
    expect(removeLineItem.outputs.map((o) => o.name)).toEqual([
      "lineItemId",
      "deleted",
    ]);
    for (const o of removeLineItem.outputs) {
      expect(o.sensitive).toBeFalsy();
    }

    // List membership picker wiring (add + remove).
    for (const key of ["hubspot:add_contact_to_list", "hubspot:remove_from_list"]) {
      const action = body.actions.find((a) => a.key === key)!;
      const listId = action.fields.find((f) => f.name === "listId")!;
      expect(listId.type).toBe("combobox");
      expect(listId.optionsSource).toBe("hubspot:lists");
      expect(listId.required).toBe(true);
    }

    // create_task select defaults round-trip through the JSON layer.
    const createTask = body.actions.find(
      (a) => a.key === "hubspot:create_task",
    )!;
    const taskStatus = createTask.fields.find(
      (f) => f.name === "hs_task_status",
    )!;
    expect(taskStatus.type).toBe("select");
    expect(taskStatus.defaultValue).toBe("NOT_STARTED");
    const taskPriority = createTask.fields.find(
      (f) => f.name === "hs_task_priority",
    )!;
    expect(taskPriority.type).toBe("select");
    expect(taskPriority.defaultValue).toBe("MEDIUM");
    const taskType = createTask.fields.find((f) => f.name === "hs_task_type")!;
    expect(taskType.type).toBe("select");
    expect(taskType.defaultValue).toBe("TODO");
    // Owners resolver wired on create_task too.
    const taskOwner = createTask.fields.find(
      (f) => f.name === "hubspot_owner_id",
    )!;
    expect(taskOwner.type).toBe("combobox");
    expect(taskOwner.optionsSource).toBe("hubspot:owners");

    // create_note body output sensitive (load-bearing — `body` is in
    // SUSPICIOUS_NAMES so missing this flag would fail the structural
    // test; pinning it here guards the wire serialization too).
    const createNote = body.actions.find(
      (a) => a.key === "hubspot:create_note",
    )!;
    expect(
      createNote.outputs.find((o) => o.name === "body")?.sensitive,
    ).toBe(true);
    expect(
      createNote.outputs.find((o) => o.name === "properties")?.sensitive,
    ).toBe(true);

    // create_line_item commerce sensitivity round-trip.
    const createLineItem = body.actions.find(
      (a) => a.key === "hubspot:create_line_item",
    )!;
    for (const oname of ["name", "quantity", "price", "discount", "amount", "properties"]) {
      expect(
        createLineItem.outputs.find((o) => o.name === oname)?.sensitive,
      ).toBe(true);
    }
    // Numeric-string fields stay text on the wire.
    for (const fname of ["quantity", "price", "discount"]) {
      const f = createLineItem.fields.find((x) => x.name === fname)!;
      expect(f.type).toBe("text");
    }

    // Product sku stays non-sensitive (public catalog identifier).
    const createProduct = body.actions.find(
      (a) => a.key === "hubspot:create_product",
    )!;
    expect(
      createProduct.outputs.find((o) => o.name === "sku")?.sensitive,
    ).toBeFalsy();
    expect(
      createProduct.outputs.find((o) => o.name === "name")?.sensitive,
    ).toBe(true);
    expect(
      createProduct.outputs.find((o) => o.name === "price")?.sensitive,
    ).toBe(true);
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
          resourcePicker?: string;
          allowManualEntry?: boolean;
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
    // GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2 — the Picker declaration must
    // survive the route layer, or the builder would render a raw ID box.
    expect(spreadsheetField.type).toBe("text");
    expect(spreadsheetField.resourcePicker).toBe("google-sheets:spreadsheet");
    expect(spreadsheetField.optionsSource).toBeUndefined();

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

  it("returns the 5 Discord action metas in displayOrder (Slice 3.DISCORD-4 — actions-only flip)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/discord/actions"), {
      params: Promise.resolve({ id: "discord" }),
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
        fields: Array<{
          name: string;
          type: string;
          optionsSource?: string;
          resourcePicker?: string;
          allowManualEntry?: boolean;
          dependsOn?: string;
          defaultValue?: unknown;
          numeric?: { min?: number; max?: number; integer?: boolean };
        }>;
      }>;
    };
    expect(body.provider).toBe("discord");
    expect(body.actions.map((a) => a.key)).toEqual([
      "discord:send_message",
      "discord:edit_message",
      "discord:delete_message",
      "discord:fetch_messages",
      "discord:assign_role",
    ]);
    expect(body.actions.every((a) => a.category === "messaging")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
    expect(body.actions.every((a) => a.producesFileRef === false)).toBe(true);
    expect(body.actions.every((a) => a.consumesFileRef === false)).toBe(true);

    const byKey = new Map(body.actions.map((a) => [a.key, a]));

    // delete_message — full destructive trio round-trips on the wire.
    const del = byKey.get("discord:delete_message")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");

    // The other 4 are not destructive.
    for (const key of [
      "discord:send_message",
      "discord:edit_message",
      "discord:fetch_messages",
      "discord:assign_role",
    ]) {
      const a = byKey.get(key)!;
      expect(a.isDestructive).toBe(false);
      expect(a.requiresConfirmation).toBe(false);
    }

    // send_message cascade wire shape: channelId depends on guildId
    // and consumes discord:channels.
    const send = byKey.get("discord:send_message")!;
    const sendChannel = send.fields.find((f) => f.name === "channelId")!;
    expect(sendChannel.optionsSource).toBe("discord:channels");
    expect(sendChannel.dependsOn).toBe("guildId");

    // fetch_messages numeric bounds + defaults round-trip on the wire.
    const fetch = byKey.get("discord:fetch_messages")!;
    const limit = fetch.fields.find((f) => f.name === "limit")!;
    expect(limit.type).toBe("number");
    expect(limit.defaultValue).toBe(20);
    expect(limit.numeric).toMatchObject({ min: 1, max: 100, integer: true });

    // fetch_messages.sortOrder default = newest, filterType default = none.
    expect(
      fetch.fields.find((f) => f.name === "sortOrder")!.defaultValue,
    ).toBe("newest");
    expect(
      fetch.fields.find((f) => f.name === "filterType")!.defaultValue,
    ).toBe("none");

    // assign_role cascade: userId → discord:members, roleId →
    // discord:roles, both deps=guildId.
    const role = byKey.get("discord:assign_role")!;
    const user = role.fields.find((f) => f.name === "userId")!;
    const roleField = role.fields.find((f) => f.name === "roleId")!;
    expect(user.optionsSource).toBe("discord:members");
    expect(user.dependsOn).toBe("guildId");
    expect(roleField.optionsSource).toBe("discord:roles");
    expect(roleField.dependsOn).toBe("guildId");
  });

  it("returns the 5 Google Docs action metas in displayOrder (Slice 3.GDOCS-4 — actions-only flip)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/google-docs/actions"), {
      params: Promise.resolve({ id: "google-docs" }),
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
          optionsSource?: string;
          resourcePicker?: string;
          allowManualEntry?: boolean;
          dependsOn?: string;
          defaultValue?: unknown;
          options?: Array<{ value: string }>;
        }>;
        outputs: Array<{ name: string; type: string; sensitive?: boolean }>;
      }>;
    };
    expect(body.provider).toBe("google-docs");
    expect(body.actions).toHaveLength(5);
    expect(body.actions.map((a) => a.key)).toEqual([
      "google-docs:create_document",
      "google-docs:update_document",
      "google-docs:share_document",
      "google-docs:get_document",
      "google-docs:export_document",
    ]);
    expect(body.actions.every((a) => a.category === "files")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);

    const byKey = new Map(body.actions.map((a) => [a.key, a]));

    // create_document — folderId wires google-drive:folders (cross-
    // product resolver shipped in GDOCS-3).
    const create = byKey.get("google-docs:create_document")!;
    const folder = create.fields.find((f) => f.name === "folderId")!;
    expect(folder.type).toBe("combobox");
    expect(folder.optionsSource).toBe("google-drive:folders");
    expect(folder.dependsOn).toBeUndefined();
    expect(folder.required).toBe(false);
    expect(create.producesFileRef).toBe(false);

    // update_document — documentId wires google-docs:documents;
    // insertLocation is required with NO default (Q11 honest-state).
    const update = byKey.get("google-docs:update_document")!;
    const docPicker = update.fields.find((f) => f.name === "documentId")!;
    expect(docPicker.optionsSource).toBe("google-docs:documents");
    const insertLocation = update.fields.find(
      (f) => f.name === "insertLocation",
    )!;
    expect(insertLocation.type).toBe("select");
    expect(insertLocation.required).toBe(true);
    expect(insertLocation.defaultValue).toBeUndefined();
    expect(insertLocation.options?.map((o) => o.value).sort()).toEqual([
      "after_text",
      "before_text",
      "beginning",
      "end",
      "replace",
    ]);

    // share_document — destructive trio round-trips; sendNotification
    // is Q11 required-explicit with NO default; permission enum is the
    // Drive canonical set.
    const share = byKey.get("google-docs:share_document")!;
    expect(share.isDestructive).toBe(true);
    expect(share.requiresConfirmation).toBe(true);
    expect(share.riskLevel).toBe("high");
    expect(share.riskDescription).toBeDefined();
    const sendNotif = share.fields.find((f) => f.name === "sendNotification")!;
    expect(sendNotif.type).toBe("boolean");
    expect(sendNotif.required).toBe(true);
    expect(sendNotif.defaultValue).toBeUndefined();
    const shareWith = share.fields.find((f) => f.name === "shareWith")!;
    expect(shareWith.type).toBe("string-array");
    expect(shareWith.optionsSource).toBeUndefined();
    const perm = share.fields.find((f) => f.name === "permission")!;
    expect(perm.options?.map((o) => o.value).sort()).toEqual([
      "commenter",
      "owner",
      "reader",
      "writer",
    ]);

    // get_document — pure read; documentId is the only field.
    const get = byKey.get("google-docs:get_document")!;
    expect(get.fields.map((f) => f.name)).toEqual(["documentId"]);
    expect(get.isDestructive).toBe(false);
    expect(get.riskLevel).toBe("low");

    // export_document — producesFileRef:true + 7-value exportFormat enum
    // + no destination field (V1 rejected per D-GD3).
    const exp = byKey.get("google-docs:export_document")!;
    expect(exp.producesFileRef).toBe(true);
    expect(exp.fields.map((f) => f.name)).toEqual([
      "documentId",
      "exportFormat",
      "fileName",
    ]);
    const exportFmt = exp.fields.find((f) => f.name === "exportFormat")!;
    expect(exportFmt.required).toBe(true);
    expect(exportFmt.options?.map((o) => o.value).sort()).toEqual([
      "docx",
      "epub",
      "html",
      "odt",
      "pdf",
      "rtf",
      "txt",
    ]);
    const fileOut = exp.outputs.find((o) => o.name === "file")!;
    expect(fileOut.type).toBe("fileRef");

    // Sensitive output round-trips through JSON for the keys the slice
    // spec flagged.
    expect(create.outputs.find((o) => o.name === "documentUrl")?.sensitive).toBe(true);
    expect(create.outputs.find((o) => o.name === "title")?.sensitive).toBe(true);
    expect(create.outputs.find((o) => o.name === "documentId")?.sensitive).toBeUndefined();
    expect(get.outputs.find((o) => o.name === "content")?.sensitive).toBe(true);
    expect(get.outputs.find((o) => o.name === "title")?.sensitive).toBe(true);
    expect(get.outputs.find((o) => o.name === "documentUrl")?.sensitive).toBe(true);
    expect(share.outputs.find((o) => o.name === "sharedWith")?.sensitive).toBe(true);
    expect(share.outputs.find((o) => o.name === "documentUrl")?.sensitive).toBe(true);
    expect(exp.outputs.find((o) => o.name === "fileName")?.sensitive).toBe(true);
    expect(exp.outputs.find((o) => o.name === "fileSize")?.sensitive).toBeUndefined();
  });

  it("returns the 12 Microsoft OneNote action metas in displayOrder (Slice 3.ONENOTE-4 — actions-only flip)", async () => {
    authedUser();
    const res = await getActions(
      new Request("http://x/microsoft-onenote/actions"),
      { params: Promise.resolve({ id: "microsoft-onenote" }) },
    );
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
        displayOrder: number | null;
        fields: Array<{
          name: string;
          type: string;
          required: boolean;
          optionsSource?: string;
          resourcePicker?: string;
          allowManualEntry?: boolean;
          dependsOn?: string;
          defaultValue?: unknown;
          options?: Array<{ value: string }>;
          numeric?: {
            min?: number;
            max?: number;
            integer?: boolean;
            step?: number;
          };
        }>;
        outputs: Array<{ name: string; type: string; sensitive?: boolean }>;
      }>;
    };
    expect(body.provider).toBe("microsoft-onenote");
    expect(body.actions).toHaveLength(12);
    expect(body.actions.map((a) => a.key)).toEqual([
      "microsoft-onenote:create_page",
      "microsoft-onenote:update_page",
      "microsoft-onenote:copy_page",
      "microsoft-onenote:get_page_content",
      "microsoft-onenote:list_pages",
      "microsoft-onenote:delete_page",
      "microsoft-onenote:create_section",
      "microsoft-onenote:list_sections",
      "microsoft-onenote:get_section_details",
      "microsoft-onenote:create_notebook",
      "microsoft-onenote:list_notebooks",
      "microsoft-onenote:get_notebook_details",
    ]);
    expect(body.actions.map((a) => a.displayOrder)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]);
    expect(body.actions.every((a) => a.category === "files")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);

    const byKey = new Map(body.actions.map((a) => [a.key, a]));

    // create_page — 3-field cascade + text/html default + medium risk.
    const create = byKey.get("microsoft-onenote:create_page")!;
    const nb = create.fields.find((f) => f.name === "notebookId")!;
    expect(nb.optionsSource).toBe("microsoft-onenote:notebooks");
    expect(nb.dependsOn).toBeUndefined();
    const sec = create.fields.find((f) => f.name === "sectionId")!;
    expect(sec.optionsSource).toBe("microsoft-onenote:sections");
    expect(sec.dependsOn).toBe("notebookId");
    const ct = create.fields.find((f) => f.name === "contentType")!;
    expect(ct.defaultValue).toBe("text/html");
    expect(ct.options?.map((o) => o.value).sort()).toEqual([
      "application/xhtml+xml",
      "text/html",
      "text/plain",
    ]);
    expect(create.isDestructive).toBe(false);
    expect(create.riskLevel).toBe("medium");

    // update_page — 3-level cascade + replace warning in description.
    const update = byKey.get("microsoft-onenote:update_page")!;
    const pg = update.fields.find((f) => f.name === "pageId")!;
    expect(pg.optionsSource).toBe("microsoft-onenote:pages");
    expect(pg.dependsOn).toBe("sectionId");
    const mode = update.fields.find((f) => f.name === "updateMode")!;
    expect(mode.options?.map((o) => o.value).sort()).toEqual([
      "append",
      "insert",
      "prepend",
      "replace",
    ]);
    expect(mode.defaultValue).toBe("append");

    // copy_page — source-side combobox cascade + target text input
    // (dual-hierarchy picker limitation).
    const copy = byKey.get("microsoft-onenote:copy_page")!;
    const srcPg = copy.fields.find((f) => f.name === "sourcePageId")!;
    expect(srcPg.type).toBe("combobox");
    expect(srcPg.optionsSource).toBe("microsoft-onenote:pages");
    expect(srcPg.dependsOn).toBe("sectionId");
    const tgtSec = copy.fields.find((f) => f.name === "targetSectionId")!;
    // RESOLVERS-1 — flat "Notebook › Section" picker (copy_page's schema is
    // .strict(), so the picker is dep-less rather than notebook-scoped).
    expect(tgtSec.type).toBe("combobox");
    expect(tgtSec.optionsSource).toBe("microsoft-onenote:target_sections");
    expect(tgtSec.allowManualEntry).toBe(true);
    expect(copy.isDestructive).toBe(false);

    // get_page_content — boolean fields preserved camelCase.
    const get = byKey.get("microsoft-onenote:get_page_content")!;
    const inc = get.fields.find((f) => f.name === "includeIDs")!;
    expect(inc.type).toBe("boolean");
    expect(inc.defaultValue).toBe(false);
    const pre = get.fields.find((f) => f.name === "preGenerated")!;
    expect(pre.type).toBe("boolean");
    expect(pre.defaultValue).toBe(true);

    // list_pages — top numeric bounds 1..100 default 20; orderBy enum;
    // deferred OData filter absent.
    const list = byKey.get("microsoft-onenote:list_pages")!;
    const top = list.fields.find((f) => f.name === "top")!;
    expect(top.type).toBe("number");
    expect(top.numeric).toEqual({ min: 1, max: 100, integer: true, step: 1 });
    expect(top.defaultValue).toBe(20);
    const ob = list.fields.find((f) => f.name === "orderBy")!;
    expect(ob.defaultValue).toBe("lastModifiedDateTime desc");
    expect(list.fields.find((f) => f.name === "filter")).toBeUndefined();

    // delete_page — destructive trio round-trips.
    const del = byKey.get("microsoft-onenote:delete_page")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");
    expect(del.riskDescription).toBeDefined();
    // No title/body/content surfaced on delete output.
    expect(del.outputs.find((o) => o.name === "title")).toBeUndefined();
    expect(del.outputs.find((o) => o.name === "content")).toBeUndefined();
    expect(del.outputs.find((o) => o.name === "body")).toBeUndefined();

    // create_notebook — single displayName field.
    const cn = byKey.get("microsoft-onenote:create_notebook")!;
    expect(cn.fields.map((f) => f.name)).toEqual(["displayName"]);
    expect(cn.isDestructive).toBe(false);

    // Sensitive output round-trips through JSON for the keys the slice
    // spec flagged.
    expect(create.outputs.find((o) => o.name === "title")?.sensitive).toBe(true);
    expect(create.outputs.find((o) => o.name === "webUrl")?.sensitive).toBe(true);
    expect(create.outputs.find((o) => o.name === "id")?.sensitive).toBeUndefined();
    expect(get.outputs.find((o) => o.name === "content")?.sensitive).toBe(true);
    expect(get.outputs.find((o) => o.name === "title")?.sensitive).toBe(true);
    expect(list.outputs.find((o) => o.name === "pages")?.sensitive).toBe(true);
    expect(list.outputs.find((o) => o.name === "count")?.sensitive).toBeUndefined();
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

  it("returns 2 Google Docs triggers (Slice 3.GDOCS-5 — new_document + document_updated via Drive files.watch)", async () => {
    authedUser();
    const res = await getTriggers(
      new Request("http://x/google-docs/triggers"),
      { params: Promise.resolve({ id: "google-docs" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      triggers: Array<{
        key: string;
        activation: string;
        requiresIntegration: boolean;
        fields: Array<{ name: string; optionsSource?: string }>;
      }>;
    };
    expect(body.triggers).toHaveLength(2);
    expect(body.triggers.map((t) => t.key)).toEqual([
      "google-docs:new_document",
      "google-docs:document_updated",
    ]);
    // Both are webhook-activated (Drive files.watch push channel).
    expect(body.triggers.every((t) => t.activation === "webhook")).toBe(true);
    expect(body.triggers.every((t) => t.requiresIntegration)).toBe(true);

    // Resolver wiring round-trips through JSON.
    const byKey = new Map(body.triggers.map((t) => [t.key, t]));
    const newDoc = byKey.get("google-docs:new_document")!;
    const folderField = newDoc.fields.find((f) => f.name === "folderId")!;
    expect(folderField.optionsSource).toBe("google-drive:folders");

    const updated = byKey.get("google-docs:document_updated")!;
    expect(
      updated.fields.find((f) => f.name === "documentId")?.optionsSource,
    ).toBe("google-docs:documents");
    expect(
      updated.fields.find((f) => f.name === "folderId")?.optionsSource,
    ).toBe("google-drive:folders");
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

  it("returns 2 Microsoft OneNote polling triggers in Slice 3.ONENOTE-5 (new_note + updated_note; Graph deprecated OneNote webhooks May 2023)", async () => {
    authedUser();
    const res = await getTriggers(
      new Request("http://x/microsoft-onenote/triggers"),
      { params: Promise.resolve({ id: "microsoft-onenote" }) },
    );
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
          required: boolean;
          optionsSource?: string;
          resourcePicker?: string;
          allowManualEntry?: boolean;
          dependsOn?: string;
        }>;
        payloadShape: Array<{ name: string; type: string; sensitive?: boolean }>;
      }>;
    };
    expect(body.provider).toBe("microsoft-onenote");
    expect(body.triggers).toHaveLength(2);
    expect(body.triggers.map((t) => t.key)).toEqual([
      "microsoft-onenote:new_note",
      "microsoft-onenote:updated_note",
    ]);
    expect(body.triggers.every((t) => t.activation === "polling")).toBe(true);
    expect(body.triggers.every((t) => t.requiresIntegration)).toBe(true);

    // new_note: 2-field cascade (notebookId → sectionId).
    const newNote = body.triggers.find((t) => t.key === "microsoft-onenote:new_note")!;
    expect(newNote.fields.map((f) => f.name)).toEqual(["notebookId", "sectionId"]);
    const newSec = newNote.fields.find((f) => f.name === "sectionId")!;
    expect(newSec.dependsOn).toBe("notebookId");
    expect(newSec.optionsSource).toBe("microsoft-onenote:sections");

    // updated_note: 3-level cascade with optional pageId.
    const updatedNote = body.triggers.find((t) => t.key === "microsoft-onenote:updated_note")!;
    expect(updatedNote.fields.map((f) => f.name)).toEqual(["notebookId", "sectionId", "pageId"]);
    const pg = updatedNote.fields.find((f) => f.name === "pageId")!;
    expect(pg.dependsOn).toBe("sectionId");
    expect(pg.optionsSource).toBe("microsoft-onenote:pages");
    expect(pg.required).toBe(false);

    // Sensitive output flags round-trip through JSON.
    const newNoteBy = new Map(newNote.payloadShape.map((p) => [p.name, p]));
    expect(newNoteBy.get("title")?.sensitive).toBe(true);
    expect(newNoteBy.get("webUrl")?.sensitive).toBe(true);
    expect(newNoteBy.get("pageId")?.sensitive).toBeUndefined();

    // No body/content in either payload.
    for (const t of body.triggers) {
      const names = t.payloadShape.map((p) => p.name);
      expect(names).not.toContain("content");
      expect(names).not.toContain("body");
    }
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

  it("returns two Discord triggers (Slice 3.DISCORD-6 slash_command + Slice 3.DISCORD-7 new_message)", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/discord/triggers"), {
      params: Promise.resolve({ id: "discord" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      triggers: Array<{ key: string; activation: string; requiresIntegration: boolean }>;
    };
    expect(body.provider).toBe("discord");
    // DISCORD-5 trigger-architecture decision:
    //   - slash_command (DISCORD-6) — webhook via Interactions Endpoint URL.
    //   - new_message (DISCORD-7) — polling via REST messages?after=.
    //   - member_join deferred (DISCORD-N-member-join; Discord REST has
    //     no join-time-indexed endpoint).
    expect(body.triggers).toHaveLength(2);
    expect(body.triggers.map((t) => t.key)).toEqual([
      "discord:slash_command",
      "discord:new_message",
    ]);
    expect(body.triggers[0]!.activation).toBe("webhook");
    expect(body.triggers[1]!.activation).toBe("polling");
    expect(body.triggers.every((t) => t.requiresIntegration)).toBe(true);
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
          resourcePicker?: string;
          allowManualEntry?: boolean;
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

  it("returns the consolidated HubSpot webhook_received trigger meta registered in Slice 3.HUBSPOT-6 (closes the HubSpot provider arc; hubspot now in COVERED_PROVIDERS)", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/hubspot/triggers"), {
      params: Promise.resolve({ id: "hubspot" }),
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
          required: boolean;
          description?: string;
        }>;
        payloadShape: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    expect(body.provider).toBe("hubspot");
    expect(body.triggers).toHaveLength(1);
    expect(body.triggers[0]!.key).toBe("hubspot:webhook_received");
    expect(body.triggers[0]!.activation).toBe("webhook");
    expect(body.triggers[0]!.requiresIntegration).toBe(true);
    expect(body.triggers[0]!.category).toBe("crm");

    // Config field — single required `subscriptions` object-list
    // (CONFIG-UX-SETUP-ADVANCED-1: structured rows replaced paste-JSON).
    expect(body.triggers[0]!.fields.map((f) => f.name)).toEqual([
      "subscriptions",
    ]);
    const subscriptionsField = body.triggers[0]!.fields[0]! as {
      name: string;
      type: string;
      required: boolean;
      description?: string;
      itemFields?: Array<{
        name: string;
        type: string;
        required: boolean;
        options?: Array<{ value: string; label: string }>;
        visibleWhen?: { field: string; valueEndsWith?: string };
      }>;
    };
    expect(subscriptionsField.type).toBe("object-list");
    expect(subscriptionsField.required).toBe(true);
    // Item fields: eventType select mirroring the activation allowlist 1:1,
    // and a propertyName text shown only for propertyChange events.
    expect(subscriptionsField.itemFields!.map((f) => f.name)).toEqual([
      "eventType",
      "propertyName",
    ]);
    const eventTypeItem = subscriptionsField.itemFields![0]!;
    expect(eventTypeItem.type).toBe("select");
    expect(eventTypeItem.required).toBe(true);
    expect(eventTypeItem.options!.map((o) => o.value)).toEqual([
      "contact.creation",
      "contact.propertyChange",
      "contact.deletion",
      "company.creation",
      "company.propertyChange",
      "company.deletion",
      "deal.creation",
      "deal.propertyChange",
      "deal.deletion",
      "ticket.creation",
      "ticket.propertyChange",
      "ticket.deletion",
    ]);
    const propertyNameItem = subscriptionsField.itemFields![1]!;
    expect(propertyNameItem.type).toBe("text");
    expect(propertyNameItem.visibleWhen).toEqual({
      field: "eventType",
      valueEndsWith: ".propertyChange",
    });

    // Payload shape — exact 12-field set, in declared order.
    expect(body.triggers[0]!.payloadShape.map((o) => o.name)).toEqual([
      "subscriptionType",
      "portalId",
      "hubId",
      "objectId",
      "propertyName",
      "propertyValue",
      "occurredAt",
      "subscriptionId",
      "appId",
      "attemptNumber",
      "changeSource",
      "event",
    ]);

    // Sensitive flags round-trip — propertyValue + event carry
    // customer data; the discriminator scalars stay structural.
    const byName = new Map(
      body.triggers[0]!.payloadShape.map((o) => [o.name, o]),
    );
    expect(byName.get("propertyValue")?.sensitive).toBe(true);
    expect(byName.get("event")?.sensitive).toBe(true);
    expect(byName.get("subscriptionType")?.sensitive).toBeFalsy();
    expect(byName.get("portalId")?.sensitive).toBeFalsy();
    expect(byName.get("objectId")?.sensitive).toBeFalsy();
    expect(byName.get("propertyName")?.sensitive).toBeFalsy();
    expect(byName.get("subscriptionId")?.sensitive).toBeFalsy();
    expect(byName.get("appId")?.sensitive).toBeFalsy();
    expect(byName.get("attemptNumber")?.sensitive).toBeFalsy();
    expect(byName.get("changeSource")?.sensitive).toBeFalsy();
  });

  // ─── MAILCHIMP-3 wire-shape pins ─────────────────────────────────────
  //
  // 12-action surface, audience-picker wiring, risk classification
  // (destructive trio + high+confirm-only), and sensitive-output
  // serialization. Mailchimp stays OUT of COVERED_PROVIDERS — the test
  // does not assert any trigger metas exist yet.
  it("returns the full 14 Mailchimp action metas in displayOrder as of Slice 3.MAILCHIMP-4 (closes the Mailchimp action surface; mailchimp now IN COVERED_PROVIDERS)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/mailchimp/actions"), {
      params: Promise.resolve({ id: "mailchimp" }),
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
          optionsSource?: string;
          resourcePicker?: string;
          allowManualEntry?: boolean;
          dependsOn?: string;
          numeric?: { min?: number; max?: number; integer?: boolean };
          options?: Array<{ value: string; label: string }>;
        }>;
        outputs: Array<{
          name: string;
          type?: string;
          sensitive?: boolean;
          fields?: Array<{ name: string; sensitive?: boolean }>;
        }>;
      }>;
    };
    expect(body.provider).toBe("mailchimp");
    expect(body.actions).toHaveLength(14);
    expect(body.actions.map((a) => a.key)).toEqual([
      // MAILCHIMP-3 (10..120).
      "mailchimp:add_subscriber",
      "mailchimp:update_subscriber",
      "mailchimp:get_subscriber",
      "mailchimp:get_subscribers",
      "mailchimp:add_tag",
      "mailchimp:remove_tag",
      "mailchimp:create_audience",
      "mailchimp:create_segment",
      "mailchimp:create_custom_event",
      "mailchimp:add_note",
      "mailchimp:unsubscribe_subscriber",
      "mailchimp:remove_subscriber",
      // MAILCHIMP-4 (130, 140).
      "mailchimp:get_campaign",
      "mailchimp:get_campaign_stats",
    ]);
    expect(body.actions.every((a) => a.category === "marketing")).toBe(true);
    expect(body.actions.every((a) => a.requiresIntegration === true)).toBe(true);
    expect(body.actions.every((a) => a.producesFileRef === false)).toBe(true);
    expect(body.actions.every((a) => a.consumesFileRef === false)).toBe(true);

    // Risk classification — destructive trio on remove_subscriber.
    const remove = body.actions.find(
      (a) => a.key === "mailchimp:remove_subscriber",
    )!;
    expect(remove.riskLevel).toBe("high");
    expect(remove.isDestructive).toBe(true);
    expect(remove.requiresConfirmation).toBe(true);
    expect(typeof remove.riskDescription).toBe("string");
    expect(remove.riskDescription!.length).toBeGreaterThan(0);

    // unsubscribe — high + confirm-only, NOT destructive (consent
    // change, record retained).
    const unsub = body.actions.find(
      (a) => a.key === "mailchimp:unsubscribe_subscriber",
    )!;
    expect(unsub.riskLevel).toBe("high");
    expect(unsub.requiresConfirmation).toBe(true);
    expect(unsub.isDestructive).toBe(false);

    // Medium-risk subset round-trips.
    for (const key of [
      "mailchimp:add_subscriber",
      "mailchimp:update_subscriber",
      "mailchimp:add_tag",
      "mailchimp:remove_tag",
      "mailchimp:create_audience",
      "mailchimp:create_segment",
      "mailchimp:create_custom_event",
    ]) {
      const a = body.actions.find((x) => x.key === key)!;
      expect(a.riskLevel).toBe("medium");
      expect(a.isDestructive).toBe(false);
      expect(a.requiresConfirmation).toBe(false);
    }

    // Low-risk reads + note.
    for (const key of [
      "mailchimp:get_subscriber",
      "mailchimp:get_subscribers",
      "mailchimp:add_note",
    ]) {
      const a = body.actions.find((x) => x.key === key)!;
      expect(a.riskLevel).toBe("low");
      expect(a.isDestructive).toBe(false);
    }

    // Audience picker wires the mailchimp:audiences resolver under
    // BOTH field-name conventions (audience_id and listId).
    const addSub = body.actions.find(
      (a) => a.key === "mailchimp:add_subscriber",
    )!;
    const addSubAudience = addSub.fields.find((f) => f.name === "audience_id")!;
    expect(addSubAudience.type).toBe("combobox");
    expect(addSubAudience.optionsSource).toBe("mailchimp:audiences");
    expect(addSubAudience.required).toBe(true);

    const getSubs = body.actions.find(
      (a) => a.key === "mailchimp:get_subscribers",
    )!;
    const getSubsListId = getSubs.fields.find((f) => f.name === "listId")!;
    expect(getSubsListId.type).toBe("combobox");
    expect(getSubsListId.optionsSource).toBe("mailchimp:audiences");
    expect(getSubsListId.required).toBe(true);

    const unsubFields = body.actions.find(
      (a) => a.key === "mailchimp:unsubscribe_subscriber",
    )!.fields;
    expect(unsubFields.find((f) => f.name === "listId")?.optionsSource).toBe(
      "mailchimp:audiences",
    );
    // Field-name preservation: unsubscribe uses `emailAddress`, not
    // `email`.
    expect(unsubFields.find((f) => f.name === "emailAddress")).toBeDefined();
    expect(unsubFields.find((f) => f.name === "email")).toBeUndefined();

    // Q11 consent gate — add_subscriber.status required, no default,
    // 5 enum options.
    const status = addSub.fields.find((f) => f.name === "status")!;
    expect(status.type).toBe("select");
    expect(status.required).toBe(true);
    expect(status.defaultValue).toBeUndefined();
    expect(status.options!.map((o) => o.value).sort()).toEqual([
      "cleaned",
      "pending",
      "subscribed",
      "transactional",
      "unsubscribed",
    ]);

    // remove_subscriber.mode — Q11 required-select gate.
    const mode = remove.fields.find((f) => f.name === "mode")!;
    expect(mode.type).toBe("select");
    expect(mode.required).toBe(true);
    expect(mode.defaultValue).toBeUndefined();
    expect(mode.options!.map((o) => o.value).sort()).toEqual([
      "archive",
      "delete_permanent",
    ]);

    // add_tag.tags is string-array (NOT CSV like add_subscriber.tags).
    const addTag = body.actions.find((a) => a.key === "mailchimp:add_tag")!;
    expect(addTag.fields.find((f) => f.name === "tags")!.type).toBe(
      "string-array",
    );

    // create_custom_event.properties is keyvalue.
    const cce = body.actions.find(
      (a) => a.key === "mailchimp:create_custom_event",
    )!;
    expect(cce.fields.find((f) => f.name === "properties")!.type).toBe(
      "keyvalue",
    );

    // get_subscribers.count surfaces its numeric bounds.
    const count = getSubs.fields.find((f) => f.name === "count")!;
    expect(count.type).toBe("number");
    expect(count.numeric?.min).toBe(1);
    expect(count.numeric?.max).toBe(100);
    expect(count.numeric?.integer).toBe(true);

    // Sensitive flags round-trip for the representative outputs.
    expect(
      addSub.outputs.find((o) => o.name === "email")?.sensitive,
    ).toBe(true);
    expect(
      addSub.outputs.find((o) => o.name === "subscriberId")?.sensitive,
    ).toBe(true);
    expect(addSub.outputs.find((o) => o.name === "tags")?.sensitive).toBe(true);
    expect(addSub.outputs.find((o) => o.name === "status")?.sensitive).toBeFalsy();

    expect(
      getSubs.outputs.find((o) => o.name === "subscribers")?.sensitive,
    ).toBe(true);
    expect(getSubs.outputs.find((o) => o.name === "count")?.sensitive).toBeFalsy();
    expect(
      getSubs.outputs.find((o) => o.name === "nextOffset")?.sensitive,
    ).toBeFalsy();

    expect(
      unsub.outputs.find((o) => o.name === "emailAddress")?.sensitive,
    ).toBe(true);
    expect(
      unsub.outputs.find((o) => o.name === "subscriberHash")?.sensitive,
    ).toBe(true);
    expect(unsub.outputs.find((o) => o.name === "success")?.sensitive).toBeFalsy();

    const note = body.actions.find((a) => a.key === "mailchimp:add_note")!;
    expect(note.outputs.find((o) => o.name === "note")?.sensitive).toBe(true);
    expect(note.outputs.find((o) => o.name === "email")?.sensitive).toBe(true);
    expect(note.outputs.find((o) => o.name === "noteId")?.sensitive).toBeFalsy();

    // Defense-in-depth: NO Mailchimp action output is a secret-shaped name.
    const banned = new Set([
      "token",
      "accessToken",
      "refreshToken",
      "clientSecret",
      "client_secret",
      "secret",
      "apiKey",
      "webhookSecret",
    ]);
    for (const action of body.actions) {
      for (const o of action.outputs) {
        expect(banned.has(o.name)).toBe(false);
      }
    }
  });

  it("MAILCHIMP-4 campaign-read action wire shape — get_campaign + get_campaign_stats are low-risk, picker = mailchimp:campaigns, nested OutputMeta.fields serialize on settings/recipients (get_campaign) + opens/clicks/bounces/forwards (get_campaign_stats)", async () => {
    authedUser();
    const res = await getActions(new Request("http://x/mailchimp/actions"), {
      params: Promise.resolve({ id: "mailchimp" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      actions: Array<{
        key: string;
        riskLevel: string;
        isDestructive: boolean;
        requiresConfirmation: boolean;
        fields: Array<{ name: string; type: string; required: boolean; optionsSource?: string }>;
        outputs: Array<{
          name: string;
          type?: string;
          sensitive?: boolean;
          fields?: Array<{ name: string; type?: string; sensitive?: boolean }>;
        }>;
      }>;
    };
    const getCampaign = body.actions.find((a) => a.key === "mailchimp:get_campaign")!;
    expect(getCampaign.riskLevel).toBe("low");
    expect(getCampaign.isDestructive).toBe(false);
    expect(getCampaign.requiresConfirmation).toBe(false);
    expect(getCampaign.fields).toHaveLength(1);
    expect(getCampaign.fields[0]!.name).toBe("campaignId");
    expect(getCampaign.fields[0]!.type).toBe("combobox");
    expect(getCampaign.fields[0]!.required).toBe(true);
    expect(getCampaign.fields[0]!.optionsSource).toBe("mailchimp:campaigns");

    // archiveUrl + longArchiveUrl sensitive on the wire.
    expect(
      getCampaign.outputs.find((o) => o.name === "archiveUrl")?.sensitive,
    ).toBe(true);
    expect(
      getCampaign.outputs.find((o) => o.name === "longArchiveUrl")?.sensitive,
    ).toBe(true);
    // settings + recipients sub-objects ship with nested fields[] populated.
    const settings = getCampaign.outputs.find((o) => o.name === "settings")!;
    expect(settings.type).toBe("object");
    expect(settings.sensitive).toBe(true);
    expect(settings.fields?.map((f) => f.name).sort()).toEqual([
      "fromName",
      "previewText",
      "replyTo",
      "subjectLine",
      "title",
    ]);
    const recipients = getCampaign.outputs.find((o) => o.name === "recipients")!;
    expect(recipients.type).toBe("object");
    expect(recipients.sensitive).toBe(true);
    expect(recipients.fields?.map((f) => f.name).sort()).toEqual([
      "listId",
      "listName",
      "recipientCount",
    ]);

    const stats = body.actions.find((a) => a.key === "mailchimp:get_campaign_stats")!;
    expect(stats.riskLevel).toBe("low");
    expect(stats.fields[0]!.optionsSource).toBe("mailchimp:campaigns");
    // Engagement aggregates are sensitive object projections; industryStats stays structural.
    for (const nestedName of ["opens", "clicks", "bounces", "forwards"]) {
      const o = stats.outputs.find((x) => x.name === nestedName)!;
      expect(o.type).toBe("object");
      expect(o.sensitive).toBe(true);
      expect((o.fields ?? []).length).toBeGreaterThan(0);
    }
    const industry = stats.outputs.find((o) => o.name === "industryStats")!;
    expect(industry.type).toBe("object");
    expect(industry.sensitive).toBeFalsy();
  });

  it("/api/providers/mailchimp/triggers returns the 7 Mailchimp triggers in displayOrder (1 webhook + 6 polling); sensitive payload fields round-trip", async () => {
    authedUser();
    const res = await getTriggers(new Request("http://x/mailchimp/triggers"), {
      params: Promise.resolve({ id: "mailchimp" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      triggers: Array<{
        key: string;
        category: string;
        activation: string;
        requiresIntegration: boolean;
        fields: Array<{
          name: string;
          type: string;
          required: boolean;
          optionsSource?: string;
          resourcePicker?: string;
          allowManualEntry?: boolean;
          dependsOn?: string;
          description?: string;
        }>;
        payloadShape: Array<{ name: string; sensitive?: boolean }>;
      }>;
    };
    expect(body.provider).toBe("mailchimp");
    expect(body.triggers).toHaveLength(7);
    expect(body.triggers.map((t) => t.key)).toEqual([
      "mailchimp:audience_event",
      "mailchimp:campaign_created",
      "mailchimp:email_opened",
      "mailchimp:link_clicked",
      "mailchimp:new_audience",
      "mailchimp:segment_updated",
      "mailchimp:subscriber_added_to_segment",
    ]);
    for (const t of body.triggers) {
      expect(t.category).toBe("marketing");
      expect(t.requiresIntegration).toBe(true);
    }
    expect(
      body.triggers.find((t) => t.key === "mailchimp:audience_event")!.activation,
    ).toBe("webhook");
    for (const k of [
      "mailchimp:campaign_created",
      "mailchimp:email_opened",
      "mailchimp:link_clicked",
      "mailchimp:new_audience",
      "mailchimp:segment_updated",
      "mailchimp:subscriber_added_to_segment",
    ]) {
      expect(body.triggers.find((t) => t.key === k)!.activation).toBe("polling");
    }

    // audience_event field-name preservation: audienceId (camelCase) +
    // eventTypes (multi-select combobox over the 6 allowed values —
    // CONFIG-UX-SETUP-ADVANCED-1).
    const audEvt = body.triggers.find((t) => t.key === "mailchimp:audience_event")!;
    const audId = audEvt.fields.find((f) => f.name === "audienceId")!;
    expect(audId.type).toBe("combobox");
    expect(audId.optionsSource).toBe("mailchimp:audiences");
    expect(audId.required).toBe(true);
    expect(audEvt.fields.find((f) => f.name === "audience_id")).toBeUndefined();
    const evtTypes = audEvt.fields.find((f) => f.name === "eventTypes")! as {
      type: string;
      required: boolean;
      description?: string;
      multiple?: boolean;
      options?: Array<{ value: string; label: string }>;
    };
    expect(evtTypes.type).toBe("combobox");
    expect(evtTypes.multiple).toBe(true);
    expect(evtTypes.required).toBe(true);
    expect(evtTypes.options!.map((o) => o.value)).toEqual([
      "subscribe",
      "unsubscribe",
      "profile",
      "upemail",
      "cleaned",
      "campaign",
    ]);
    for (const allowed of [
      "subscribe",
      "unsubscribe",
      "profile",
      "upemail",
      "cleaned",
      "campaign",
    ]) {
      expect(evtTypes.description).toContain(allowed);
    }

    // segment-scoped triggers expose the listId → segmentId cascade.
    for (const k of [
      "mailchimp:segment_updated",
      "mailchimp:subscriber_added_to_segment",
    ]) {
      const t = body.triggers.find((x) => x.key === k)!;
      const listId = t.fields.find((f) => f.name === "listId")!;
      expect(listId.type).toBe("combobox");
      expect(listId.optionsSource).toBe("mailchimp:audiences");
      const segmentId = t.fields.find((f) => f.name === "segmentId")!;
      expect(segmentId.type).toBe("combobox");
      expect(segmentId.optionsSource).toBe("mailchimp:segments");
      expect(segmentId.dependsOn).toBe("listId");
    }

    // Representative sensitive-output round-trip for trigger payloads.
    const aePayload = new Map(
      audEvt.payloadShape.map((o) => [o.name, o]),
    );
    expect(aePayload.get("email")?.sensitive).toBe(true);
    expect(aePayload.get("subscriberHash")?.sensitive).toBe(true);
    expect(aePayload.get("parsed")?.sensitive).toBe(true);
    expect(aePayload.get("type")?.sensitive).toBeFalsy();
    expect(aePayload.get("audienceId")?.sensitive).toBeFalsy();

    const ccPayload = new Map(
      body.triggers
        .find((t) => t.key === "mailchimp:campaign_created")!
        .payloadShape.map((o) => [o.name, o]),
    );
    expect(ccPayload.get("title")?.sensitive).toBe(true);
    expect(ccPayload.get("subjectLine")?.sensitive).toBe(true);
    expect(ccPayload.get("audienceName")?.sensitive).toBe(true);
    expect(ccPayload.get("campaignId")?.sensitive).toBeFalsy();

    const lcPayload = new Map(
      body.triggers
        .find((t) => t.key === "mailchimp:link_clicked")!
        .payloadShape.map((o) => [o.name, o]),
    );
    expect(lcPayload.get("email")?.sensitive).toBe(true);
    expect(lcPayload.get("url")?.sensitive).toBe(true);
    expect(lcPayload.get("urlId")?.sensitive).toBeFalsy();

    // Defense-in-depth: no secret-shaped trigger payload names.
    const banned = new Set([
      "token",
      "accessToken",
      "refreshToken",
      "clientSecret",
      "client_secret",
      "secret",
      "apiKey",
      "webhookSecret",
    ]);
    for (const t of body.triggers) {
      for (const o of t.payloadShape) {
        expect(banned.has(o.name)).toBe(false);
      }
    }
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
