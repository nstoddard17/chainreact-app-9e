/**
 * Unit tests for services/discovery/_registry.ts.
 *
 * Covers:
 *   - listAllActionMetas / listAllTriggerMetas return non-empty + sorted
 *     by (displayOrder asc, displayName asc).
 *   - listActionMetasForProvider("native") returns exactly the 5 native
 *     actions; unknown provider returns [].
 *   - listTriggerMetasForProvider("native") returns the 2 native triggers.
 *   - getActionMeta / getTriggerMeta resolve registered keys and return
 *     undefined for unknown.
 *   - listProvidersWithMetadata returns sorted unique provider ids.
 *   - All registered metas pass their respective Zod parse (defense in
 *     depth — module-load parse covers this already, but a re-run here
 *     surfaces drift in the contract).
 */
import {
  ActionMetaSchema,
  type ActionMeta,
} from "@/contracts/actionMeta";
import {
  TriggerMetaSchema,
} from "@/contracts/triggerMeta";
import {
  getActionMeta,
  getTriggerMeta,
  listActionMetasForProvider,
  listAllActionMetas,
  listAllTriggerMetas,
  listProvidersWithMetadata,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES } from "@/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes";

describe("listAllActionMetas", () => {
  it("returns the native action metas registered in Slice 3.0", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "native:http_request",
        "native:format_transformer",
        "native:delay",
        "native:if_then_condition",
        "native:router",
      ]),
    );
  });

  it("returns the GitHub action metas registered in Slice 3.0b", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "github:create_issue",
        "github:create_repository",
        "github:create_pull_request",
        "github:create_branch",
        "github:create_gist",
        "github:add_comment",
      ]),
    );
  });

  it("returns the Gmail action metas registered in Slice 3.15", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("returns the Microsoft Outlook Mail action metas registered in Slice 3.17", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "microsoft-outlook:send_email",
        "microsoft-outlook:reply_to_email",
        "microsoft-outlook:forward_email",
        "microsoft-outlook:create_draft_email",
        "microsoft-outlook:fetch_emails",
        "microsoft-outlook:get_attachment",
        "microsoft-outlook:add_categories",
        "microsoft-outlook:move_email",
        "microsoft-outlook:delete_email",
      ]),
    );
  });

  it("returns the partial Slack action coverage registered in Slices 3.26 + 3.27 (download_file + upload_file)", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining(["slack:download_file", "slack:upload_file"]),
    );
  });

  it("returns the Notion page + database action metas registered in Slice 3.41", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "notion:create_page",
        "notion:update_page",
        "notion:archive_page",
        "notion:restore_page",
        "notion:get_page",
        "notion:create_database",
        "notion:create_database_entry",
        "notion:query_database",
        "notion:search",
      ]),
    );
  });

  it("returns the Notion blocks + comments + users action metas registered in Slice 3.42 (closes Notion at 16/16)", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "notion:append_block_children",
        "notion:get_block",
        "notion:get_block_children",
        "notion:create_comment",
        "notion:list_comments",
        "notion:get_user",
        "notion:list_users",
      ]),
    );
  });

  it("returns the Stripe customer + payment lifecycle action metas registered in Slice 3.45", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "stripe:create_customer",
        "stripe:update_customer",
        "stripe:find_customer",
        "stripe:create_payment_intent",
        "stripe:confirm_payment_intent",
        "stripe:capture_payment_intent",
        "stripe:create_refund",
        "stripe:find_payment_intent",
      ]),
    );
  });

  it("returns the Stripe subscriptions + commerce action metas registered in Slice 3.46 (closes Stripe at 16/16)", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "stripe:create_subscription",
        "stripe:update_subscription",
        "stripe:cancel_subscription",
        "stripe:find_subscription",
        "stripe:create_checkout_session",
        "stripe:create_payment_link",
        "stripe:create_invoice",
        "stripe:get_payments",
      ]),
    );
  });

  it("returns the Google Sheets read + simple-write action metas registered in Slice 3.GSHEETS-3", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "google-sheets:read_rows",
        "google-sheets:get_cell_value",
        "google-sheets:get_sheet_metadata",
        "google-sheets:find_row",
        "google-sheets:create_spreadsheet",
        "google-sheets:append_row",
        "google-sheets:update_row",
        "google-sheets:update_cell",
      ]),
    );
  });

  it("returns the Google Sheets destructive + bulk + formatting action metas registered in Slice 3.GSHEETS-4 (closes Google Sheets at 12/12)", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "google-sheets:clear_range",
        "google-sheets:delete_row",
        "google-sheets:batch_update",
        "google-sheets:format_range",
      ]),
    );
  });

  it("Google Sheets action coverage is now complete (12 actions; google-sheets in COVERED_PROVIDERS)", () => {
    const metas = listAllActionMetas().filter(
      (m) => m.provider === "google-sheets",
    );
    expect(metas).toHaveLength(12);
  });

  it("returns the Google Sheets trigger metas registered in Slice 3.GSHEETS-4", () => {
    const metas = listAllTriggerMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "google-sheets:new_worksheet",
        "google-sheets:row_changed",
      ]),
    );
  });

  it("returns the HubSpot contact + company action metas registered in Slice 3.HUBSPOT-3", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "hubspot:create_contact",
        "hubspot:update_contact",
        "hubspot:get_contacts",
        "hubspot:create_company",
        "hubspot:update_company",
        "hubspot:get_companies",
      ]),
    );
  });

  it("returns the HubSpot deal + ticket + owners-read action metas registered in Slice 3.HUBSPOT-4", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "hubspot:create_deal",
        "hubspot:update_deal",
        "hubspot:get_deals",
        "hubspot:create_ticket",
        "hubspot:update_ticket",
        "hubspot:get_tickets",
        "hubspot:get_owners",
      ]),
    );
  });

  it("returns the HubSpot engagement + list + commerce action metas registered in Slice 3.HUBSPOT-5 (closes the HubSpot action surface at 26/26)", () => {
    const metas = listAllActionMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("hubspot is now in COVERED_PROVIDERS — 26 action metas + 1 trigger meta (HUBSPOT-6 closes the provider arc)", () => {
    const actionMetas = listAllActionMetas().filter(
      (m) => m.provider === "hubspot",
    );
    expect(actionMetas).toHaveLength(26);
    const triggerMetas = listAllTriggerMetas().filter(
      (m) => m.provider === "hubspot",
    );
    expect(triggerMetas).toHaveLength(1);
    expect(triggerMetas[0]!.key).toBe("hubspot:webhook_received");
  });

  it("sorts by (displayOrder asc, displayName asc)", () => {
    const metas = listAllActionMetas();
    for (let i = 1; i < metas.length; i++) {
      const a = metas[i - 1]!;
      const b = metas[i]!;
      if (a.displayOrder !== null && b.displayOrder !== null) {
        expect(a.displayOrder).toBeLessThanOrEqual(b.displayOrder);
      }
    }
  });

  it("returns metas that pass the Zod contract", () => {
    for (const m of listAllActionMetas()) {
      expect(() => ActionMetaSchema.parse(m)).not.toThrow();
    }
  });
});

describe("listAllTriggerMetas", () => {
  it("returns the native trigger metas registered in Slice 3.0", () => {
    const metas = listAllTriggerMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "native:manual.run",
        "native:schedule.fired",
      ]),
    );
  });

  it("returns the GitHub trigger meta registered in Slice 3.0b", () => {
    const metas = listAllTriggerMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toContain("github:new_commit");
  });

  it("returns the Gmail trigger metas registered in Slice 3.12", () => {
    const metas = listAllTriggerMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "gmail:new_email",
        "gmail:new_labeled_email",
        "gmail:new_attachment",
      ]),
    );
  });

  it("returns the Slack trigger metas registered in Slice 3.11", () => {
    const metas = listAllTriggerMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("returns the Microsoft Outlook Mail trigger metas registered in Slice 3.17", () => {
    const metas = listAllTriggerMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "microsoft-outlook:new_email",
        "microsoft-outlook:email_sent",
        "microsoft-outlook:email_flagged",
      ]),
    );
  });

  it("returns the consolidated HubSpot webhook trigger meta registered in Slice 3.HUBSPOT-6", () => {
    const metas = listAllTriggerMetas();
    const keys = metas.map((m) => m.key);
    expect(keys).toContain("hubspot:webhook_received");
  });

  it("returns metas that pass the Zod contract", () => {
    for (const m of listAllTriggerMetas()) {
      expect(() => TriggerMetaSchema.parse(m)).not.toThrow();
    }
  });
});

describe("per-provider accessors", () => {
  it("listActionMetasForProvider('native') returns 5 actions", () => {
    const metas = listActionMetasForProvider("native");
    expect(metas).toHaveLength(5);
    expect(metas.every((m) => m.provider === "native")).toBe(true);
  });

  it("listTriggerMetasForProvider('native') returns 2 triggers", () => {
    const metas = listTriggerMetasForProvider("native");
    expect(metas).toHaveLength(2);
    expect(metas.every((m) => m.provider === "native")).toBe(true);
  });

  it("listActionMetasForProvider('github') returns 6 actions in displayOrder", () => {
    const metas = listActionMetasForProvider("github");
    expect(metas).toHaveLength(6);
    expect(metas.every((m) => m.provider === "github")).toBe(true);
    expect(metas.map((m) => m.key)).toEqual([
      "github:create_issue",
      "github:create_repository",
      "github:create_pull_request",
      "github:create_branch",
      "github:create_gist",
      "github:add_comment",
    ]);
  });

  it("listTriggerMetasForProvider('github') returns 1 trigger", () => {
    const metas = listTriggerMetasForProvider("github");
    expect(metas).toHaveLength(1);
    expect(metas[0]!.key).toBe("github:new_commit");
    expect(metas[0]!.activation).toBe("webhook");
  });

  it("every GitHub action meta declares requiresIntegration: true", () => {
    const metas = listActionMetasForProvider("github");
    expect(metas.every((m) => m.requiresIntegration === true)).toBe(true);
  });

  it("the GitHub trigger meta declares requiresIntegration: true", () => {
    const metas = listTriggerMetasForProvider("github");
    expect(metas[0]!.requiresIntegration).toBe(true);
  });

  it("every GitHub meta uses the developer category", () => {
    const actionMetas = listActionMetasForProvider("github");
    expect(actionMetas.every((m) => m.category === "developer")).toBe(true);
    const triggerMetas = listTriggerMetasForProvider("github");
    expect(triggerMetas.every((m) => m.category === "developer")).toBe(true);
  });

  it("listActionMetasForProvider('gmail') returns the 15 Gmail actions in displayOrder", () => {
    const metas = listActionMetasForProvider("gmail");
    expect(metas).toHaveLength(15);
    expect(metas.every((m) => m.provider === "gmail")).toBe(true);
    expect(metas.map((m) => m.key)).toEqual([
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
      // Slice 4.GMAIL-READ-1 — metadata-only reads (displayOrder 140/150).
      "gmail:list_labels",
      "gmail:get_profile",
    ]);
  });

  it("every Gmail action meta declares requiresIntegration=true and category='email'", () => {
    const metas = listActionMetasForProvider("gmail");
    for (const m of metas) {
      expect(m.requiresIntegration).toBe(true);
      expect(m.category).toBe("email");
    }
  });

  // Slice 3.15 — pin the field-type choices for high-risk Gmail action
  // metas. Each codifies a deliberate design decision so contract↔meta
  // drift (e.g. recipient field reverting to CSV-in-text) fails fast.
  describe("gmail:send_email field-type choices (Slice 3.15)", () => {
    function sendEmailFields() {
      const meta = listActionMetasForProvider("gmail").find(
        (m) => m.key === "gmail:send_email",
      );
      expect(meta).toBeDefined();
      return meta!.fields;
    }

    it("`to` is a required string-array (chip input, not CSV-in-text)", () => {
      const f = sendEmailFields().find((x) => x.name === "to");
      expect(f).toBeDefined();
      expect(f!.type).toBe("string-array");
      expect(f!.required).toBe(true);
    });

    it("`cc` and `bcc` are optional string-array", () => {
      const cc = sendEmailFields().find((x) => x.name === "cc");
      const bcc = sendEmailFields().find((x) => x.name === "bcc");
      expect(cc!.type).toBe("string-array");
      expect(cc!.required).toBe(false);
      expect(bcc!.type).toBe("string-array");
      expect(bcc!.required).toBe(false);
    });

    it("`textBody` and `htmlBody` are textareas (both optional)", () => {
      const t = sendEmailFields().find((x) => x.name === "textBody");
      const h = sendEmailFields().find((x) => x.name === "htmlBody");
      expect(t!.type).toBe("textarea");
      expect(t!.required).toBe(false);
      expect(h!.type).toBe("textarea");
      expect(h!.required).toBe(false);
    });

    it("`labels` is an optional string-array (label ids only, no name lookup)", () => {
      const f = sendEmailFields().find((x) => x.name === "labels");
      expect(f).toBeDefined();
      expect(f!.type).toBe("string-array");
      expect(f!.required).toBe(false);
    });
  });

  describe("gmail:delete_email required deleteMode (parity-gmail.md decision 2)", () => {
    it("`deleteMode` is a required select with no defaultValue", () => {
      const meta = listActionMetasForProvider("gmail").find(
        (m) => m.key === "gmail:delete_email",
      );
      expect(meta).toBeDefined();
      const f = meta!.fields.find((x) => x.name === "deleteMode");
      expect(f).toBeDefined();
      expect(f!.type).toBe("select");
      expect(f!.required).toBe(true);
      expect(f!.defaultValue).toBeUndefined();
      expect(f!.options!.map((o) => o.value).sort()).toEqual([
        "permanent",
        "trash",
      ]);
    });
  });

  describe("gmail:get_attachment FileRef boundary (Slice 3.15)", () => {
    it("declares producesFileRef=true and outputs a fileRef-typed `file`", () => {
      const meta = listActionMetasForProvider("gmail").find(
        (m) => m.key === "gmail:get_attachment",
      );
      expect(meta).toBeDefined();
      expect(meta!.producesFileRef).toBe(true);
      expect(meta!.consumesFileRef).toBe(false);
      const fileOut = meta!.outputs.find((o) => o.name === "file");
      expect(fileOut).toBeDefined();
      expect(fileOut!.type).toBe("fileRef");
    });
  });

  describe("gmail:add_label / gmail:remove_label labelIds shape", () => {
    it("both expose `labelIds` as a required string-array", () => {
      for (const key of ["gmail:add_label", "gmail:remove_label"]) {
        const meta = listActionMetasForProvider("gmail").find(
          (m) => m.key === key,
        );
        expect(meta).toBeDefined();
        const f = meta!.fields.find((x) => x.name === "labelIds");
        expect(f).toBeDefined();
        expect(f!.type).toBe("string-array");
        expect(f!.required).toBe(true);
      }
    });
  });

  describe("gmail:search_emails discriminated-union surface", () => {
    it("exposes `searchMode` as a required select with both modes + defaults to 'filters'", () => {
      const meta = listActionMetasForProvider("gmail").find(
        (m) => m.key === "gmail:search_emails",
      );
      expect(meta).toBeDefined();
      const f = meta!.fields.find((x) => x.name === "searchMode");
      expect(f).toBeDefined();
      expect(f!.type).toBe("select");
      expect(f!.required).toBe(true);
      expect(f!.defaultValue).toBe("filters");
      expect(f!.options!.map((o) => o.value).sort()).toEqual([
        "filters",
        "query",
      ]);
    });

    it("exposes `labelIds` as a string-array in the filters branch", () => {
      const meta = listActionMetasForProvider("gmail").find(
        (m) => m.key === "gmail:search_emails",
      );
      const f = meta!.fields.find((x) => x.name === "labelIds");
      expect(f).toBeDefined();
      expect(f!.type).toBe("string-array");
      expect(f!.required).toBe(false);
    });
  });

  it("listTriggerMetasForProvider('gmail') returns the 3 Gmail triggers in displayOrder", () => {
    const metas = listTriggerMetasForProvider("gmail");
    expect(metas).toHaveLength(3);
    expect(metas.every((m) => m.provider === "gmail")).toBe(true);
    expect(metas.map((m) => m.key)).toEqual([
      "gmail:new_email",
      "gmail:new_labeled_email",
      "gmail:new_attachment",
    ]);
  });

  it("every Gmail trigger meta declares activation='polling' and requiresIntegration=true", () => {
    const metas = listTriggerMetasForProvider("gmail");
    for (const m of metas) {
      expect(m.activation).toBe("polling");
      expect(m.requiresIntegration).toBe(true);
    }
  });

  it("every Gmail trigger meta uses the email category", () => {
    const metas = listTriggerMetasForProvider("gmail");
    for (const m of metas) {
      expect(m.category).toBe("email");
    }
  });

  // Slice 3.14 — pin the field-type choices for Gmail trigger metas so
  // any contract↔meta drift (e.g. a future refactor that converts `from`
  // to `text` losing the chip renderer) fails this test before reaching
  // the builder. Each assertion encodes a deliberate design decision
  // from Slice 3.12 / 3.13.
  describe("gmail:new_email field-type choices (Slice 3.13)", () => {
    function newEmailFields() {
      const meta = listTriggerMetasForProvider("gmail").find(
        (m) => m.key === "gmail:new_email",
      );
      expect(meta).toBeDefined();
      return meta!.fields;
    }

    it("exposes 5 user-configurable fields", () => {
      expect(newEmailFields()).toHaveLength(5);
    });

    it("`from` is a string-array with defaultValue: []", () => {
      const f = newEmailFields().find((x) => x.name === "from");
      expect(f).toBeDefined();
      expect(f!.type).toBe("string-array");
      expect(f!.required).toBe(false);
      expect(f!.defaultValue).toEqual([]);
    });

    it("`subject` is a text field", () => {
      const f = newEmailFields().find((x) => x.name === "subject");
      expect(f).toBeDefined();
      expect(f!.type).toBe("text");
      expect(f!.required).toBe(false);
    });

    it("`subjectExactMatch` is a boolean with defaultValue: true", () => {
      const f = newEmailFields().find((x) => x.name === "subjectExactMatch");
      expect(f).toBeDefined();
      expect(f!.type).toBe("boolean");
      expect(f!.defaultValue).toBe(true);
    });

    it("`hasAttachment` is a select with 3 options + defaultValue: 'any'", () => {
      const f = newEmailFields().find((x) => x.name === "hasAttachment");
      expect(f).toBeDefined();
      expect(f!.type).toBe("select");
      expect(f!.defaultValue).toBe("any");
      expect(f!.options).toHaveLength(3);
      expect(f!.options!.map((o) => o.value).sort()).toEqual([
        "any",
        "no",
        "yes",
      ]);
    });

    it("`labelIds` is a string-array with defaultValue: ['INBOX']", () => {
      const f = newEmailFields().find((x) => x.name === "labelIds");
      expect(f).toBeDefined();
      expect(f!.type).toBe("string-array");
      expect(f!.required).toBe(false);
      expect(f!.defaultValue).toEqual(["INBOX"]);
    });
  });

  describe("gmail:new_labeled_email field-type choices (Slice 3.12)", () => {
    it("has a single required `labelId` text field", () => {
      const meta = listTriggerMetasForProvider("gmail").find(
        (m) => m.key === "gmail:new_labeled_email",
      );
      expect(meta).toBeDefined();
      expect(meta!.fields).toHaveLength(1);
      const f = meta!.fields[0]!;
      expect(f.name).toBe("labelId");
      expect(f.type).toBe("text");
      expect(f.required).toBe(true);
    });
  });

  describe("gmail:new_attachment field-type choices (Slice 3.12)", () => {
    it("has zero user-set fields (runtime schema declares none in v1)", () => {
      const meta = listTriggerMetasForProvider("gmail").find(
        (m) => m.key === "gmail:new_attachment",
      );
      expect(meta).toBeDefined();
      expect(meta!.fields).toHaveLength(0);
    });
  });

  it("listTriggerMetasForProvider('slack') returns the 10 Slack triggers in displayOrder", () => {
    const metas = listTriggerMetasForProvider("slack");
    expect(metas).toHaveLength(10);
    expect(metas.every((m) => m.provider === "slack")).toBe(true);
    expect(metas.map((m) => m.key)).toEqual([
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
  });

  it("every Slack trigger meta declares activation='webhook' and requiresIntegration=true", () => {
    const metas = listTriggerMetasForProvider("slack");
    for (const m of metas) {
      expect(m.activation).toBe("webhook");
      expect(m.requiresIntegration).toBe(true);
    }
  });

  it("every Slack trigger meta uses a Slack-appropriate category (messaging or files)", () => {
    const metas = listTriggerMetasForProvider("slack");
    for (const m of metas) {
      expect(["messaging", "files"]).toContain(m.category);
    }
  });

  it("listActionMetasForProvider('microsoft-outlook') returns the 11 Outlook actions in displayOrder", () => {
    const metas = listActionMetasForProvider("microsoft-outlook");
    expect(metas).toHaveLength(11);
    expect(metas.every((m) => m.provider === "microsoft-outlook")).toBe(true);
    expect(metas.map((m) => m.key)).toEqual([
      "microsoft-outlook:send_email",
      "microsoft-outlook:reply_to_email",
      "microsoft-outlook:forward_email",
      "microsoft-outlook:create_draft_email",
      "microsoft-outlook:fetch_emails",
      "microsoft-outlook:get_attachment",
      "microsoft-outlook:add_categories",
      "microsoft-outlook:move_email",
      "microsoft-outlook:delete_email",
      // Slice 4.OUTLOOK-READ-1 — metadata-only reads (displayOrder 100/110).
      "microsoft-outlook:list_folders",
      "microsoft-outlook:get_profile",
    ]);
  });

  it("listTriggerMetasForProvider('microsoft-outlook') returns the 3 Outlook triggers in displayOrder", () => {
    const metas = listTriggerMetasForProvider("microsoft-outlook");
    expect(metas).toHaveLength(3);
    expect(metas.every((m) => m.provider === "microsoft-outlook")).toBe(true);
    expect(metas.map((m) => m.key)).toEqual([
      "microsoft-outlook:new_email",
      "microsoft-outlook:email_sent",
      "microsoft-outlook:email_flagged",
    ]);
  });

  it("every Outlook action meta declares requiresIntegration=true and category='email'", () => {
    const metas = listActionMetasForProvider("microsoft-outlook");
    for (const m of metas) {
      expect(m.requiresIntegration).toBe(true);
      expect(m.category).toBe("email");
    }
  });

  it("every Outlook trigger meta declares activation='webhook', requiresIntegration=true, category='email'", () => {
    const metas = listTriggerMetasForProvider("microsoft-outlook");
    for (const m of metas) {
      expect(m.activation).toBe("webhook");
      expect(m.requiresIntegration).toBe(true);
      expect(m.category).toBe("email");
    }
  });

  // Slice 3.17 — pin field-type choices for high-risk Outlook surfaces.
  // Each codifies a deliberate design decision (Outlook Phase 2 Q11
  // required-no-default enums; recipient/category chip arrays; FileRef-
  // producing get_attachment). Drift here fails fast.
  describe("microsoft-outlook:send_email field-type choices", () => {
    function sendFields() {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:send_email",
      );
      expect(meta).toBeDefined();
      return meta!.fields;
    }

    it("`to`/`cc`/`bcc` are string-array (chip input, not CSV-in-text)", () => {
      for (const name of ["to", "cc", "bcc"]) {
        const f = sendFields().find((x) => x.name === name);
        expect(f).toBeDefined();
        expect(f!.type).toBe("string-array");
      }
      expect(sendFields().find((x) => x.name === "to")!.required).toBe(true);
      expect(sendFields().find((x) => x.name === "cc")!.required).toBe(false);
      expect(sendFields().find((x) => x.name === "bcc")!.required).toBe(false);
    });

    it("`body` is textarea (optional at meta level; schema rejects key-absent)", () => {
      const f = sendFields().find((x) => x.name === "body");
      expect(f).toBeDefined();
      expect(f!.type).toBe("textarea");
    });

    it("`isHtml` is required boolean with NO default (Outlook Q11)", () => {
      const f = sendFields().find((x) => x.name === "isHtml");
      expect(f).toBeDefined();
      expect(f!.type).toBe("boolean");
      expect(f!.required).toBe(true);
      expect(f!.defaultValue).toBeUndefined();
    });

    it("`importance` is required select with NO default and 3 options (Outlook Q11)", () => {
      const f = sendFields().find((x) => x.name === "importance");
      expect(f).toBeDefined();
      expect(f!.type).toBe("select");
      expect(f!.required).toBe(true);
      expect(f!.defaultValue).toBeUndefined();
      expect(f!.options!.map((o) => o.value).sort()).toEqual([
        "high",
        "low",
        "normal",
      ]);
    });

    it("declares consumesFileRef=true (runtime + builder both accept FileRef[])", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:send_email",
      );
      expect(meta!.consumesFileRef).toBe(true);
      expect(meta!.producesFileRef).toBe(false);
    });

    // Slice 3.23 — `attachments` is now surfaced as a `file-array`
    // field. Runtime cap (3 MB per / 25 MB total) stays
    // handler-authoritative; the meta cap is a UI hint.
    it("`attachments` is file-array, optional, with fileArrayMaxItems UI hint (Slice 3.23)", () => {
      const f = sendFields().find((x) => x.name === "attachments");
      expect(f).toBeDefined();
      expect(f!.type).toBe("file-array");
      expect(f!.required).toBe(false);
      expect(f!.fileArrayMaxItems).toBe(25);
    });
  });

  describe("microsoft-outlook:reply_to_email replyAll required (Outlook Q11)", () => {
    it("`replyAll` is a required boolean with NO default", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:reply_to_email",
      );
      expect(meta).toBeDefined();
      const f = meta!.fields.find((x) => x.name === "replyAll");
      expect(f).toBeDefined();
      expect(f!.type).toBe("boolean");
      expect(f!.required).toBe(true);
      expect(f!.defaultValue).toBeUndefined();
    });
  });

  describe("microsoft-outlook:forward_email recipients", () => {
    it("`to` is required string-array; `cc` is optional string-array", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:forward_email",
      );
      const to = meta!.fields.find((x) => x.name === "to");
      const cc = meta!.fields.find((x) => x.name === "cc");
      expect(to!.type).toBe("string-array");
      expect(to!.required).toBe(true);
      expect(cc!.type).toBe("string-array");
      expect(cc!.required).toBe(false);
    });
  });

  describe("microsoft-outlook:create_draft_email Q11 required-no-default enums", () => {
    it("`isHtml` and `importance` are required with NO defaults", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:create_draft_email",
      );
      const isHtml = meta!.fields.find((x) => x.name === "isHtml");
      const importance = meta!.fields.find((x) => x.name === "importance");
      expect(isHtml!.required).toBe(true);
      expect(isHtml!.defaultValue).toBeUndefined();
      expect(importance!.required).toBe(true);
      expect(importance!.defaultValue).toBeUndefined();
    });
  });

  describe("microsoft-outlook:delete_email deleteMode required-no-default (Outlook Q11)", () => {
    it("`deleteMode` is required select with NO default and 2 options", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:delete_email",
      );
      const f = meta!.fields.find((x) => x.name === "deleteMode");
      expect(f!.type).toBe("select");
      expect(f!.required).toBe(true);
      expect(f!.defaultValue).toBeUndefined();
      expect(f!.options!.map((o) => o.value).sort()).toEqual([
        "permanent",
        "trash",
      ]);
    });
  });

  describe("microsoft-outlook:add_categories categories array", () => {
    it("`categories` is a required string-array (PATCH-replace semantics)", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:add_categories",
      );
      const f = meta!.fields.find((x) => x.name === "categories");
      expect(f!.type).toBe("string-array");
      expect(f!.required).toBe(true);
    });
  });

  describe("microsoft-outlook:fetch_emails surface", () => {
    it("exposes folderId / query / startDate / endDate / maxResults", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:fetch_emails",
      );
      const names = meta!.fields.map((f) => f.name).sort();
      expect(names).toEqual([
        "endDate",
        "folderId",
        "maxResults",
        "query",
        "startDate",
      ]);
      const max = meta!.fields.find((f) => f.name === "maxResults")!;
      expect(max.type).toBe("number");
      expect(max.defaultValue).toBe(10);
      expect(max.numeric).toMatchObject({ min: 1, max: 50, integer: true });
    });
  });

  describe("microsoft-outlook:get_attachment FileRef[] boundary", () => {
    it("declares producesFileRef=true; outputs.attachments is array", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:get_attachment",
      );
      expect(meta!.producesFileRef).toBe(true);
      expect(meta!.consumesFileRef).toBe(false);
      const attachments = meta!.outputs.find((o) => o.name === "attachments");
      expect(attachments).toBeDefined();
      expect(attachments!.type).toBe("array");
    });

    it("`downloadMode` defaults to 'all' with 3 options", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:get_attachment",
      );
      const f = meta!.fields.find((x) => x.name === "downloadMode");
      expect(f!.type).toBe("select");
      expect(f!.defaultValue).toBe("all");
      expect(f!.options!.map((o) => o.value).sort()).toEqual([
        "all",
        "by_extension",
        "by_name",
      ]);
    });

    it("`fileExtensions` is string-array (CSV-or-array runtime → chip UI)", () => {
      const meta = listActionMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:get_attachment",
      );
      const f = meta!.fields.find((x) => x.name === "fileExtensions");
      expect(f!.type).toBe("string-array");
    });
  });

  describe("microsoft-outlook:new_email filter surface (Slice 3.17)", () => {
    it("exposes folder / from / subject / subjectExactMatch / hasAttachment / importance", () => {
      const meta = listTriggerMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:new_email",
      );
      const names = meta!.fields.map((f) => f.name).sort();
      expect(names).toEqual([
        "folder",
        "from",
        "hasAttachment",
        "importance",
        "subject",
        "subjectExactMatch",
      ]);
    });

    it("subjectExactMatch defaults to true (V1-parity)", () => {
      const meta = listTriggerMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:new_email",
      );
      const f = meta!.fields.find((x) => x.name === "subjectExactMatch");
      expect(f!.defaultValue).toBe(true);
    });

    it("hasAttachment and importance default to 'any' (V1-parity)", () => {
      const meta = listTriggerMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:new_email",
      );
      expect(
        meta!.fields.find((x) => x.name === "hasAttachment")!.defaultValue,
      ).toBe("any");
      expect(
        meta!.fields.find((x) => x.name === "importance")!.defaultValue,
      ).toBe("any");
    });
  });

  describe("microsoft-outlook:email_sent filter surface", () => {
    it("`to` is optional string-array (V2 matches actual V1 dispatch, not V1's declared 'required')", () => {
      const meta = listTriggerMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:email_sent",
      );
      const f = meta!.fields.find((x) => x.name === "to");
      expect(f).toBeDefined();
      expect(f!.type).toBe("string-array");
      expect(f!.required).toBe(false);
    });
  });

  describe("microsoft-outlook:email_flagged D-OM4 over-fire surface", () => {
    it("exposes folder only (D-OM4 — no prior-state cache, V1-parity over-fire)", () => {
      const meta = listTriggerMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:email_flagged",
      );
      const names = meta!.fields.map((f) => f.name);
      expect(names).toEqual(["folder"]);
      const folder = meta!.fields[0]!;
      expect(folder.type).toBe("text");
      expect(folder.required).toBe(false);
    });

    it("payloadShape carries the flag object (flagStatus + due/start/completed timestamps)", () => {
      const meta = listTriggerMetasForProvider("microsoft-outlook").find(
        (m) => m.key === "microsoft-outlook:email_flagged",
      );
      const flagOut = meta!.payloadShape.find((p) => p.name === "flag");
      expect(flagOut).toBeDefined();
      expect(flagOut!.type).toBe("object");
    });
  });

  // Slice 3.26 — first Slack action meta. Pin the FileRef-producer
  // surface so a future renderer/picker change can't silently regress
  // the contract that downstream FileRef consumers rely on.
  describe("slack:download_file FileRef producer surface (Slice 3.26)", () => {
    function downloadMeta() {
      const meta = listActionMetasForProvider("slack").find(
        (m) => m.key === "slack:download_file",
      );
      expect(meta).toBeDefined();
      return meta!;
    }

    it("is registered under provider 'slack' with category 'files' + requiresIntegration true", () => {
      const meta = downloadMeta();
      expect(meta.provider).toBe("slack");
      expect(meta.type).toBe("download_file");
      expect(meta.category).toBe("files");
      expect(meta.requiresIntegration).toBe(true);
    });

    it("declares producesFileRef=true and consumesFileRef=false", () => {
      const meta = downloadMeta();
      expect(meta.producesFileRef).toBe(true);
      expect(meta.consumesFileRef).toBe(false);
    });

    it("exposes a single required `fileId` text field (mirrors SlackDownloadFileConfigSchema)", () => {
      const fields = downloadMeta().fields;
      expect(fields.map((f) => f.name)).toEqual(["fileId"]);
      const fileId = fields[0]!;
      expect(fileId.type).toBe("text");
      expect(fileId.required).toBe(true);
    });

    it("output `file` is a fileRef chip; siblings are bounded scalars (no bytes / base64 / content)", () => {
      const outputs = downloadMeta().outputs;
      const file = outputs.find((o) => o.name === "file");
      expect(file).toBeDefined();
      expect(file!.type).toBe("fileRef");
      // Bounded sibling outputs — handler return shape on
      // downloadFile.ts:113-121. No bytes / base64 / content fields.
      const names = outputs.map((o) => o.name);
      expect(names).toEqual(["file", "fileId", "fileName", "mimeType", "sizeBytes"]);
      for (const banned of ["bytes", "base64", "content", "data"]) {
        expect(names).not.toContain(banned);
      }
    });

    it("Slack action coverage as of Slice 3.38 is the full 31/31 registered surface in displayOrder (Slack now in COVERED_PROVIDERS)", () => {
      const slackActionKeys = listActionMetasForProvider("slack").map(
        (m) => m.key,
      );
      expect(slackActionKeys).toEqual([
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
    });

    describe("Slack messaging Group A surface (Slice 3.35)", () => {
      const GROUP_A_KEYS = [
        "slack:send_channel_message",
        "slack:send_direct_message",
        "slack:update_message",
        "slack:delete_message",
        "slack:get_messages",
        "slack:get_thread_messages",
        "slack:schedule_message",
        "slack:cancel_scheduled_message",
      ] as const;

      function metaByKey(key: string): ActionMeta {
        const meta = listActionMetasForProvider("slack").find(
          (m) => m.key === key,
        );
        if (!meta) throw new Error(`Slack meta '${key}' not registered.`);
        return meta;
      }

      it.each(GROUP_A_KEYS)(
        "%s declares provider=slack, category=messaging, requiresIntegration=true",
        (key) => {
          const meta = metaByKey(key);
          expect(meta.provider).toBe("slack");
          expect(meta.category).toBe("messaging");
          expect(meta.requiresIntegration).toBe(true);
        },
      );

      it.each(GROUP_A_KEYS)(
        "%s declares producesFileRef=false and consumesFileRef=false",
        (key) => {
          const meta = metaByKey(key);
          expect(meta.producesFileRef).toBe(false);
          expect(meta.consumesFileRef).toBe(false);
        },
      );

      it.each(GROUP_A_KEYS)(
        "%s output names exclude bytes/base64/content/data (no payload leakage)",
        (key) => {
          const outputNames = metaByKey(key).outputs.map((o) => o.name);
          for (const banned of ["bytes", "base64", "content", "data"]) {
            expect(outputNames).not.toContain(banned);
          }
        },
      );

      // Channel-field-bearing actions: every channel field MUST be the
      // async combobox sourced from `slack:channels`. send_direct_message
      // has no `channel` field (it opens the DM channel from a userId),
      // and Get / List / etc. all carry channel either as required or
      // optional.
      const CHANNEL_FIELD_KEYS = [
        "slack:send_channel_message",
        "slack:update_message",
        "slack:delete_message",
        "slack:get_messages",
        "slack:get_thread_messages",
        "slack:schedule_message",
        "slack:cancel_scheduled_message",
      ] as const;

      it.each(CHANNEL_FIELD_KEYS)(
        "%s `channel` field is a required async combobox sourced from slack:channels",
        (key) => {
          const channel = metaByKey(key).fields.find(
            (f) => f.name === "channel",
          );
          expect(channel).toBeDefined();
          expect(channel!.type).toBe("combobox");
          expect(channel!.required).toBe(true);
          expect(channel!.optionsSource).toBe("slack:channels");
          expect(channel!.options).toBeUndefined();
        },
      );

      it("send_direct_message exposes `userId` as a required slack:users combobox (shipped in the config-field UX sweep)", () => {
        const userId = metaByKey("slack:send_direct_message").fields.find(
          (f) => f.name === "userId",
        );
        expect(userId).toBeDefined();
        expect(userId!.type).toBe("combobox");
        expect(userId!.required).toBe(true);
        expect(userId!.optionsSource).toBe("slack:users");
        expect(userId!.allowManualEntry).toBe(true);
      });

      it.each([
        ["slack:send_channel_message", "text"],
        ["slack:send_direct_message", "text"],
        ["slack:update_message", "text"],
        ["slack:schedule_message", "text"],
      ] as const)(
        "%s message body field `%s` is a textarea",
        (key, fieldName) => {
          const field = metaByKey(key).fields.find((f) => f.name === fieldName);
          expect(field).toBeDefined();
          expect(field!.type).toBe("textarea");
          expect(field!.required).toBe(true);
        },
      );

      it.each([
        ["slack:send_channel_message", "threadTs", false],
        ["slack:send_direct_message", "threadTs", false],
        ["slack:update_message", "ts", true],
        ["slack:delete_message", "ts", true],
        ["slack:get_thread_messages", "threadTs", true],
        ["slack:schedule_message", "threadTs", false],
        ["slack:cancel_scheduled_message", "scheduledMessageId", true],
      ] as const)(
        "%s timestamp/id field `%s` is text with required=%s",
        (key, fieldName, required) => {
          const field = metaByKey(key).fields.find((f) => f.name === fieldName);
          expect(field).toBeDefined();
          expect(field!.type).toBe("text");
          expect(field!.required).toBe(required);
        },
      );

      it("schedule_message exposes postAt as a required datetime-utc field with UTC + legacy-format helper text", () => {
        // CONFIG-FIELD-UX-SWEEP-3: postAt adopted the `datetime-utc` instant
        // renderer (stores `…Z`). The handler still accepts the pasted
        // offset/Unix-seconds forms (they hydrate via the text fallback), so
        // required-ness + the strict-format help text are preserved.
        const postAt = metaByKey("slack:schedule_message").fields.find(
          (f) => f.name === "postAt",
        );
        expect(postAt).toBeDefined();
        expect(postAt!.type).toBe("datetime-utc");
        expect(postAt!.required).toBe(true);
        expect(postAt!.description).toMatch(/UTC|Unix-seconds/i);
      });

      it.each(GROUP_A_KEYS)(
        "%s does NOT expose `cursor` (server-managed pagination handle)",
        (key) => {
          const fieldNames = metaByKey(key).fields.map((f) => f.name);
          expect(fieldNames).not.toContain("cursor");
        },
      );

      it("get_messages declares limit as a numeric field bounded to Slack's 1..1000 range", () => {
        const limit = metaByKey("slack:get_messages").fields.find(
          (f) => f.name === "limit",
        );
        expect(limit).toBeDefined();
        expect(limit!.type).toBe("number");
        expect(limit!.required).toBe(false);
        expect(limit!.numeric).toEqual(
          expect.objectContaining({ min: 1, max: 1000, integer: true }),
        );
      });

      it("get_messages output includes pagination scalars (count/hasMore/nextCursor) and a `messages` array", () => {
        const outputs = metaByKey("slack:get_messages").outputs;
        const names = outputs.map((o) => o.name);
        expect(names).toEqual(["messages", "count", "hasMore", "nextCursor"]);
        const messages = outputs.find((o) => o.name === "messages")!;
        expect(messages.type).toBe("array");
      });

      it("send_channel_message output is {channel, ts, message:object} matching the handler exactly", () => {
        const outputs = metaByKey("slack:send_channel_message").outputs;
        expect(outputs.map((o) => o.name)).toEqual(["channel", "ts", "message"]);
        expect(outputs.find((o) => o.name === "message")!.type).toBe("object");
      });

      it("schedule_message output exposes scheduledMessageId for downstream cancel wiring", () => {
        const outputs = metaByKey("slack:schedule_message").outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "channel",
          "scheduledMessageId",
          "postAt",
        ]);
      });

      it("cancel_scheduled_message output is {channel, scheduledMessageId, cancelled:boolean}", () => {
        const outputs = metaByKey("slack:cancel_scheduled_message").outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "channel",
          "scheduledMessageId",
          "cancelled",
        ]);
        expect(outputs.find((o) => o.name === "cancelled")!.type).toBe(
          "boolean",
        );
      });

      it("Group A displayOrders are unique within the Slack provider", () => {
        const orders = listActionMetasForProvider("slack").map(
          (m) => m.displayOrder,
        );
        const unique = new Set(orders);
        expect(unique.size).toBe(orders.length);
      });
    });

    describe("Slack reactions / pins / list_scheduled surface (Slice 3.36 — Group B)", () => {
      const GROUP_B_KEYS = [
        "slack:add_reaction",
        "slack:remove_reaction",
        "slack:pin_message",
        "slack:unpin_message",
        "slack:list_scheduled_messages",
      ] as const;

      function metaByKey(key: string): ActionMeta {
        const meta = listActionMetasForProvider("slack").find(
          (m) => m.key === key,
        );
        if (!meta) throw new Error(`Slack meta '${key}' not registered.`);
        return meta;
      }

      it.each(GROUP_B_KEYS)(
        "%s declares provider=slack, category=messaging, requiresIntegration=true",
        (key) => {
          const meta = metaByKey(key);
          expect(meta.provider).toBe("slack");
          expect(meta.category).toBe("messaging");
          expect(meta.requiresIntegration).toBe(true);
        },
      );

      it.each(GROUP_B_KEYS)(
        "%s declares producesFileRef=false and consumesFileRef=false",
        (key) => {
          const meta = metaByKey(key);
          expect(meta.producesFileRef).toBe(false);
          expect(meta.consumesFileRef).toBe(false);
        },
      );

      it.each(GROUP_B_KEYS)(
        "%s output names exclude bytes/base64/content/data (no payload leakage)",
        (key) => {
          const outputNames = metaByKey(key).outputs.map((o) => o.name);
          for (const banned of ["bytes", "base64", "content", "data"]) {
            expect(outputNames).not.toContain(banned);
          }
        },
      );

      it.each(GROUP_B_KEYS)(
        "%s does NOT expose `cursor` (server-managed pagination handle)",
        (key) => {
          const fieldNames = metaByKey(key).fields.map((f) => f.name);
          expect(fieldNames).not.toContain("cursor");
        },
      );

      // Channel-field-bearing actions: add/remove_reaction and pin/unpin
      // require channel (single-message ops). list_scheduled_messages
      // makes channel optional (filter scope is workspace-wide by
      // default).
      it.each([
        ["slack:add_reaction", true],
        ["slack:remove_reaction", true],
        ["slack:pin_message", true],
        ["slack:unpin_message", true],
        ["slack:list_scheduled_messages", false],
      ] as const)(
        "%s `channel` field is an async combobox sourced from slack:channels with required=%s",
        (key, required) => {
          const channel = metaByKey(key).fields.find(
            (f) => f.name === "channel",
          );
          expect(channel).toBeDefined();
          expect(channel!.type).toBe("combobox");
          expect(channel!.required).toBe(required);
          expect(channel!.optionsSource).toBe("slack:channels");
          expect(channel!.options).toBeUndefined();
        },
      );

      // add/remove_reaction + pin/unpin all carry a required `ts`.
      // list_scheduled_messages does not (it operates by post-at
      // window, not a single message).
      it.each([
        "slack:add_reaction",
        "slack:remove_reaction",
        "slack:pin_message",
        "slack:unpin_message",
      ] as const)(
        "%s `ts` field is a required text field with strict Slack timestamp placeholder",
        (key) => {
          const ts = metaByKey(key).fields.find((f) => f.name === "ts");
          expect(ts).toBeDefined();
          expect(ts!.type).toBe("text");
          expect(ts!.required).toBe(true);
          expect(ts!.placeholder).toMatch(/\d{10}\.\d{6}/);
        },
      );

      it("list_scheduled_messages has no `ts` field (operates on post-at window, not a single message)", () => {
        const ts = metaByKey("slack:list_scheduled_messages").fields.find(
          (f) => f.name === "ts",
        );
        expect(ts).toBeUndefined();
      });

      it.each(["slack:add_reaction", "slack:remove_reaction"] as const)(
        "%s `reaction` field is a required text field with bare-name placeholder",
        (key) => {
          const reaction = metaByKey(key).fields.find(
            (f) => f.name === "reaction",
          );
          expect(reaction).toBeDefined();
          expect(reaction!.type).toBe("text");
          expect(reaction!.required).toBe(true);
          // Bare name placeholder (no surrounding colons) — handler
          // accepts both forms but the canonical UX hints at the bare
          // form.
          expect(reaction!.placeholder).toBe("thumbsup");
          // No optionsSource — Slack does not expose a workspace-emoji
          // list endpoint.
          expect(reaction!.optionsSource).toBeUndefined();
        },
      );

      it("add_reaction output is {channel, ts, reaction} echo shape", () => {
        const outputs = metaByKey("slack:add_reaction").outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "channel",
          "ts",
          "reaction",
        ]);
      });

      it("remove_reaction output is {channel, ts, reaction} echo shape", () => {
        const outputs = metaByKey("slack:remove_reaction").outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "channel",
          "ts",
          "reaction",
        ]);
      });

      it.each(["slack:pin_message", "slack:unpin_message"] as const)(
        "%s output is {channel, ts} echo shape",
        (key) => {
          const outputs = metaByKey(key).outputs;
          expect(outputs.map((o) => o.name)).toEqual(["channel", "ts"]);
        },
      );

      it("list_scheduled_messages declares limit numeric bounds 1..1000", () => {
        const limit = metaByKey(
          "slack:list_scheduled_messages",
        ).fields.find((f) => f.name === "limit");
        expect(limit).toBeDefined();
        expect(limit!.type).toBe("number");
        expect(limit!.required).toBe(false);
        expect(limit!.numeric).toEqual(
          expect.objectContaining({ min: 1, max: 1000, integer: true }),
        );
      });

      it("list_scheduled_messages output includes pagination scalars (count/hasMore/nextCursor) and a `messages` array", () => {
        const outputs = metaByKey(
          "slack:list_scheduled_messages",
        ).outputs;
        const names = outputs.map((o) => o.name);
        expect(names).toEqual(["messages", "count", "hasMore", "nextCursor"]);
        expect(outputs.find((o) => o.name === "messages")!.type).toBe("array");
      });

      it("Group B displayOrders extend Group A without collision", () => {
        const orders = listActionMetasForProvider("slack").map(
          (m) => m.displayOrder,
        );
        expect(new Set(orders).size).toBe(orders.length);
      });
    });

    describe("Slack channel management surface (Slice 3.37 — Group C)", () => {
      const GROUP_C_KEYS = [
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
      ] as const;

      function metaByKey(key: string): ActionMeta {
        const meta = listActionMetasForProvider("slack").find(
          (m) => m.key === key,
        );
        if (!meta) throw new Error(`Slack meta '${key}' not registered.`);
        return meta;
      }

      it("Group C registers all 12 channel-management actions", () => {
        for (const key of GROUP_C_KEYS) {
          expect(
            listActionMetasForProvider("slack").find((m) => m.key === key),
          ).toBeDefined();
        }
      });

      it.each(GROUP_C_KEYS)(
        "%s declares provider=slack, category=messaging, requiresIntegration=true",
        (key) => {
          const meta = metaByKey(key);
          expect(meta.provider).toBe("slack");
          expect(meta.category).toBe("messaging");
          expect(meta.requiresIntegration).toBe(true);
        },
      );

      it.each(GROUP_C_KEYS)(
        "%s declares producesFileRef=false and consumesFileRef=false",
        (key) => {
          const meta = metaByKey(key);
          expect(meta.producesFileRef).toBe(false);
          expect(meta.consumesFileRef).toBe(false);
        },
      );

      it.each(GROUP_C_KEYS)(
        "%s output names exclude bytes/base64/content/data (no payload leakage)",
        (key) => {
          const outputNames = metaByKey(key).outputs.map((o) => o.name);
          for (const banned of ["bytes", "base64", "content", "data"]) {
            expect(outputNames).not.toContain(banned);
          }
        },
      );

      it.each(GROUP_C_KEYS)(
        "%s does NOT expose `cursor` (server-managed pagination handle)",
        (key) => {
          const fieldNames = metaByKey(key).fields.map((f) => f.name);
          expect(fieldNames).not.toContain("cursor");
        },
      );

      // Channel-field-bearing actions. list_channels has NO channel
      // field (it discovers channels); create_channel has NO channel
      // field (it creates one). Everything else takes channel.
      const CHANNEL_FIELD_KEYS = [
        "slack:get_channel_info",
        "slack:archive_channel",
        "slack:unarchive_channel",
        "slack:rename_channel",
        "slack:join_channel",
        "slack:leave_channel",
        "slack:invite_users_to_channel",
        "slack:remove_user_from_channel",
        "slack:set_channel_topic",
        "slack:set_channel_purpose",
      ] as const;

      it.each(CHANNEL_FIELD_KEYS)(
        "%s `channel` field is a required async combobox sourced from slack:channels",
        (key) => {
          const channel = metaByKey(key).fields.find(
            (f) => f.name === "channel",
          );
          expect(channel).toBeDefined();
          expect(channel!.type).toBe("combobox");
          expect(channel!.required).toBe(true);
          expect(channel!.optionsSource).toBe("slack:channels");
          expect(channel!.options).toBeUndefined();
        },
      );

      it("list_channels has no channel field (action discovers channels)", () => {
        const channel = metaByKey("slack:list_channels").fields.find(
          (f) => f.name === "channel",
        );
        expect(channel).toBeUndefined();
      });

      it("create_channel has no channel field (action creates a new one)", () => {
        const channel = metaByKey("slack:create_channel").fields.find(
          (f) => f.name === "channel",
        );
        expect(channel).toBeUndefined();
      });

      it("list_channels.kind is a select with the public/private/both options + no enabled default", () => {
        const kind = metaByKey("slack:list_channels").fields.find(
          (f) => f.name === "kind",
        );
        expect(kind).toBeDefined();
        expect(kind!.type).toBe("select");
        expect(kind!.required).toBe(false);
        expect(kind!.options?.map((o) => o.value)).toEqual([
          "public",
          "private",
          "both",
        ]);
        expect(kind!.defaultValue).toBeUndefined();
      });

      it("list_channels.excludeArchived is an optional boolean (handler default is true)", () => {
        const excl = metaByKey("slack:list_channels").fields.find(
          (f) => f.name === "excludeArchived",
        );
        expect(excl).toBeDefined();
        expect(excl!.type).toBe("boolean");
        expect(excl!.required).toBe(false);
      });

      it("list_channels.limit is bounded 1..1000 integer", () => {
        const limit = metaByKey("slack:list_channels").fields.find(
          (f) => f.name === "limit",
        );
        expect(limit).toBeDefined();
        expect(limit!.type).toBe("number");
        expect(limit!.numeric).toEqual(
          expect.objectContaining({ min: 1, max: 1000, integer: true }),
        );
      });

      it("create_channel.name is a required text field (Slack sanitizes server-side)", () => {
        const name = metaByKey("slack:create_channel").fields.find(
          (f) => f.name === "name",
        );
        expect(name).toBeDefined();
        expect(name!.type).toBe("text");
        expect(name!.required).toBe(true);
      });

      it("create_channel.isPrivate is a required boolean with NO defaultValue (Q11 — no hidden default)", () => {
        const isPrivate = metaByKey("slack:create_channel").fields.find(
          (f) => f.name === "isPrivate",
        );
        expect(isPrivate).toBeDefined();
        expect(isPrivate!.type).toBe("boolean");
        expect(isPrivate!.required).toBe(true);
        expect(isPrivate!.defaultValue).toBeUndefined();
      });

      it("rename_channel.name is a required text field", () => {
        const name = metaByKey("slack:rename_channel").fields.find(
          (f) => f.name === "name",
        );
        expect(name).toBeDefined();
        expect(name!.type).toBe("text");
        expect(name!.required).toBe(true);
      });

      it("invite_users_to_channel.users is a required string-array (multi-select combobox is deferred)", () => {
        const users = metaByKey("slack:invite_users_to_channel").fields.find(
          (f) => f.name === "users",
        );
        expect(users).toBeDefined();
        expect(users!.type).toBe("string-array");
        expect(users!.required).toBe(true);
        // No slack:users resolver yet.
        expect(users!.optionsSource).toBeUndefined();
      });

      it("invite_users_to_channel.sendInviteNotification is a required boolean with NO defaultValue (Q11)", () => {
        const flag = metaByKey(
          "slack:invite_users_to_channel",
        ).fields.find((f) => f.name === "sendInviteNotification");
        expect(flag).toBeDefined();
        expect(flag!.type).toBe("boolean");
        expect(flag!.required).toBe(true);
        expect(flag!.defaultValue).toBeUndefined();
      });

      it("remove_user_from_channel.user is a required slack:users combobox (shipped in the config-field UX sweep)", () => {
        const user = metaByKey("slack:remove_user_from_channel").fields.find(
          (f) => f.name === "user",
        );
        expect(user).toBeDefined();
        expect(user!.type).toBe("combobox");
        expect(user!.required).toBe(true);
        expect(user!.optionsSource).toBe("slack:users");
        expect(user!.allowManualEntry).toBe(true);
      });

      it.each([
        ["slack:set_channel_topic", "topic"],
        ["slack:set_channel_purpose", "purpose"],
      ] as const)(
        "%s `%s` field is a required textarea (Slack permits multi-line up to 250 chars)",
        (key, fieldName) => {
          const field = metaByKey(key).fields.find((f) => f.name === fieldName);
          expect(field).toBeDefined();
          expect(field!.type).toBe("textarea");
          expect(field!.required).toBe(true);
        },
      );

      it("list_channels output is {channels, count, hasMore, nextCursor}", () => {
        const outputs = metaByKey("slack:list_channels").outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "channels",
          "count",
          "hasMore",
          "nextCursor",
        ]);
        expect(outputs.find((o) => o.name === "channels")!.type).toBe("array");
      });

      it("get_channel_info output exposes the bounded Slack channel scalars", () => {
        const outputs = metaByKey("slack:get_channel_info").outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "channel",
          "id",
          "name",
          "is_private",
          "is_archived",
          "num_members",
          "topic",
          "purpose",
          "created",
        ]);
      });

      it("create_channel output is {channel, id, name, is_private}", () => {
        const outputs = metaByKey("slack:create_channel").outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "channel",
          "id",
          "name",
          "is_private",
        ]);
      });

      it.each(["slack:archive_channel", "slack:leave_channel"] as const)(
        "%s output is {channel} echo shape",
        (key) => {
          const outputs = metaByKey(key).outputs;
          expect(outputs.map((o) => o.name)).toEqual(["channel"]);
        },
      );

      it("unarchive_channel output is {channel} echo shape", () => {
        const outputs = metaByKey("slack:unarchive_channel").outputs;
        expect(outputs.map((o) => o.name)).toEqual(["channel"]);
      });

      it.each(["slack:rename_channel", "slack:join_channel"] as const)(
        "%s output is {channel, id, name}",
        (key) => {
          const outputs = metaByKey(key).outputs;
          expect(outputs.map((o) => o.name)).toEqual(["channel", "id", "name"]);
        },
      );

      it("invite_users_to_channel output is {channel, users, invited_count}", () => {
        const outputs = metaByKey(
          "slack:invite_users_to_channel",
        ).outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "channel",
          "users",
          "invited_count",
        ]);
      });

      it("remove_user_from_channel output is {channel, user}", () => {
        const outputs = metaByKey(
          "slack:remove_user_from_channel",
        ).outputs;
        expect(outputs.map((o) => o.name)).toEqual(["channel", "user"]);
      });

      it.each([
        ["slack:set_channel_topic", "topic"],
        ["slack:set_channel_purpose", "purpose"],
      ] as const)(
        "%s output is {channel, %s}",
        (key, fieldName) => {
          const outputs = metaByKey(key).outputs;
          expect(outputs.map((o) => o.name)).toEqual(["channel", fieldName]);
        },
      );

      it("Group C displayOrders extend Group A + B without collision", () => {
        const orders = listActionMetasForProvider("slack").map(
          (m) => m.displayOrder,
        );
        expect(new Set(orders).size).toBe(orders.length);
      });
    });

    describe("Slack users + final file + block-kit surface (Slice 3.38 — Group D + E)", () => {
      const GROUP_D_E_KEYS = [
        "slack:get_user_info",
        "slack:list_users",
        "slack:get_file_info",
        "slack:post_interactive_blocks",
      ] as const;

      function metaByKey(key: string): ActionMeta {
        const meta = listActionMetasForProvider("slack").find(
          (m) => m.key === key,
        );
        if (!meta) throw new Error(`Slack meta '${key}' not registered.`);
        return meta;
      }

      it("Group D + E registers all 4 remaining actions", () => {
        for (const key of GROUP_D_E_KEYS) {
          expect(
            listActionMetasForProvider("slack").find((m) => m.key === key),
          ).toBeDefined();
        }
      });

      it.each(GROUP_D_E_KEYS)(
        "%s declares provider=slack and requiresIntegration=true",
        (key) => {
          const meta = metaByKey(key);
          expect(meta.provider).toBe("slack");
          expect(meta.requiresIntegration).toBe(true);
        },
      );

      it.each([
        ["slack:get_user_info", "messaging"],
        ["slack:list_users", "messaging"],
        ["slack:get_file_info", "files"],
        ["slack:post_interactive_blocks", "messaging"],
      ] as const)("%s category is %s", (key, category) => {
        expect(metaByKey(key).category).toBe(category);
      });

      it.each(GROUP_D_E_KEYS)(
        "%s output names exclude bytes/base64/content/data (no payload leakage)",
        (key) => {
          const outputNames = metaByKey(key).outputs.map((o) => o.name);
          for (const banned of ["bytes", "base64", "content", "data"]) {
            expect(outputNames).not.toContain(banned);
          }
        },
      );

      it.each(GROUP_D_E_KEYS)(
        "%s does NOT expose `cursor` (server-managed pagination handle)",
        (key) => {
          const fieldNames = metaByKey(key).fields.map((f) => f.name);
          expect(fieldNames).not.toContain("cursor");
        },
      );

      // FileRef flags — only get_file_info produces a FileRef.
      it.each([
        ["slack:get_user_info", false, false],
        ["slack:list_users", false, false],
        ["slack:get_file_info", true, false],
        ["slack:post_interactive_blocks", false, false],
      ] as const)(
        "%s producesFileRef=%s, consumesFileRef=%s",
        (key, produces, consumes) => {
          const meta = metaByKey(key);
          expect(meta.producesFileRef).toBe(produces);
          expect(meta.consumesFileRef).toBe(consumes);
        },
      );

      it("get_user_info `user` field is a required slack:users combobox (shipped in the config-field UX sweep)", () => {
        const user = metaByKey("slack:get_user_info").fields.find(
          (f) => f.name === "user",
        );
        expect(user).toBeDefined();
        expect(user!.type).toBe("combobox");
        expect(user!.required).toBe(true);
        expect(user!.optionsSource).toBe("slack:users");
        expect(user!.allowManualEntry).toBe(true);
        expect(user!.placeholder).toBe("Search users or paste a user ID");
      });

      it("get_user_info output mirrors the handler's bounded scalar set", () => {
        const outputs = metaByKey("slack:get_user_info").outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "user",
          "id",
          "name",
          "real_name",
          "display_name",
          "is_admin",
          "is_owner",
          "is_bot",
          "tz",
          "image_192",
        ]);
      });

      it("list_users exposes only the bounded `limit` field (no channel, no cursor)", () => {
        const fields = metaByKey("slack:list_users").fields;
        expect(fields.map((f) => f.name)).toEqual(["limit"]);
        const limit = fields[0]!;
        expect(limit.type).toBe("number");
        expect(limit.required).toBe(false);
        expect(limit.numeric).toEqual(
          expect.objectContaining({ min: 1, max: 1000, integer: true }),
        );
      });

      it("list_users output is {users, count, hasMore, nextCursor}", () => {
        const outputs = metaByKey("slack:list_users").outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "users",
          "count",
          "hasMore",
          "nextCursor",
        ]);
        expect(outputs.find((o) => o.name === "users")!.type).toBe("array");
      });

      it("get_file_info `fileId` is a required text field with F-prefixed placeholder", () => {
        const fileId = metaByKey("slack:get_file_info").fields.find(
          (f) => f.name === "fileId",
        );
        expect(fileId).toBeDefined();
        expect(fileId!.type).toBe("text");
        expect(fileId!.required).toBe(true);
        expect(fileId!.placeholder).toBe("F01ABC23DEF");
      });

      it("get_file_info `includeComments` is an optional boolean (no defaultValue)", () => {
        const flag = metaByKey("slack:get_file_info").fields.find(
          (f) => f.name === "includeComments",
        );
        expect(flag).toBeDefined();
        expect(flag!.type).toBe("boolean");
        expect(flag!.required).toBe(false);
        expect(flag!.defaultValue).toBeUndefined();
      });

      it("get_file_info output declares `file` as a `fileRef` type chip and mirrors the handler's bounded scalars", () => {
        const outputs = metaByKey("slack:get_file_info").outputs;
        const names = outputs.map((o) => o.name);
        expect(names).toEqual([
          "file",
          "fileId",
          "fileName",
          "title",
          "fileType",
          "mimeType",
          "sizeBytes",
          "permalink",
          "permalinkPublic",
          "uploaderId",
          "channels",
          "isPublic",
          "isExternal",
          "createdAt",
          "commentsCount",
          "comments",
        ]);
        expect(outputs.find((o) => o.name === "file")!.type).toBe("fileRef");
      });

      it("post_interactive_blocks `channel` is a required async combobox sourced from slack:channels", () => {
        const channel = metaByKey(
          "slack:post_interactive_blocks",
        ).fields.find((f) => f.name === "channel");
        expect(channel).toBeDefined();
        expect(channel!.type).toBe("combobox");
        expect(channel!.required).toBe(true);
        expect(channel!.optionsSource).toBe("slack:channels");
      });

      it("post_interactive_blocks `blocks` is a required textarea (Block Kit JSON paste — no keyvalue / no structured editor in v1)", () => {
        const blocks = metaByKey(
          "slack:post_interactive_blocks",
        ).fields.find((f) => f.name === "blocks");
        expect(blocks).toBeDefined();
        expect(blocks!.type).toBe("textarea");
        expect(blocks!.required).toBe(true);
      });

      it("post_interactive_blocks `text` is an optional text fallback (Q11 — no silent auto-fallback)", () => {
        const text = metaByKey(
          "slack:post_interactive_blocks",
        ).fields.find((f) => f.name === "text");
        expect(text).toBeDefined();
        expect(text!.type).toBe("text");
        expect(text!.required).toBe(false);
        expect(text!.defaultValue).toBeUndefined();
      });

      it("post_interactive_blocks `threadTs` is an optional text field with strict Slack timestamp placeholder", () => {
        const threadTs = metaByKey(
          "slack:post_interactive_blocks",
        ).fields.find((f) => f.name === "threadTs");
        expect(threadTs).toBeDefined();
        expect(threadTs!.type).toBe("text");
        expect(threadTs!.required).toBe(false);
        expect(threadTs!.placeholder).toMatch(/\d{10}\.\d{6}/);
      });

      it("post_interactive_blocks output is {channel, ts, message:object} matching the handler exactly", () => {
        const outputs = metaByKey(
          "slack:post_interactive_blocks",
        ).outputs;
        expect(outputs.map((o) => o.name)).toEqual(["channel", "ts", "message"]);
        expect(outputs.find((o) => o.name === "message")!.type).toBe("object");
      });

      it("Group D + E close Slack coverage at exactly 31 unique displayOrders", () => {
        const orders = listActionMetasForProvider("slack").map(
          (m) => m.displayOrder,
        );
        expect(orders.length).toBe(31);
        expect(new Set(orders).size).toBe(orders.length);
      });

      it("Slack action coverage is 1:1 with registered handlers (31/31 — structural test now enforces this going forward)", () => {
        const slackMetaCount = listActionMetasForProvider("slack").length;
        expect(slackMetaCount).toBe(31);
      });
    });

    it("does NOT regress Slack trigger metas (Slice 3.11 surface unchanged)", () => {
      const triggers = listTriggerMetasForProvider("slack").map((m) => m.key);
      // Spot-check rather than full-list — the trigger surface is its
      // own slice and shouldn't be re-asserted here.
      expect(triggers).toEqual(
        expect.arrayContaining([
          "slack:message.channel",
          "slack:reaction_added",
          "slack:file_shared",
        ]),
      );
    });
  });

  // Slice 3.27 — first single-FileRef consumer meta. Pin the field
  // shapes + the dual FileRef advertisement (config.file in / output.file
  // out) so a future renderer/picker change can't silently regress the
  // contract that the FileField integration test relies on.
  describe("slack:upload_file single-FileRef consumer surface (Slice 3.27)", () => {
    function uploadMeta() {
      const meta = listActionMetasForProvider("slack").find(
        (m) => m.key === "slack:upload_file",
      );
      expect(meta).toBeDefined();
      return meta!;
    }

    it("is registered under provider 'slack' with category 'files' + requiresIntegration true", () => {
      const meta = uploadMeta();
      expect(meta.provider).toBe("slack");
      expect(meta.type).toBe("upload_file");
      expect(meta.category).toBe("files");
      expect(meta.requiresIntegration).toBe(true);
    });

    it("declares BOTH producesFileRef=true AND consumesFileRef=true (dual FileRef action)", () => {
      const meta = uploadMeta();
      // Runtime accepts a FileRef in `config.file` AND emits a Slack-
      // hosted FileRef in `output.file` (uploadFile.ts:221-240). The
      // meta MUST advertise both — silently dropping producesFileRef
      // would break downstream chip rendering in the variable picker.
      expect(meta.consumesFileRef).toBe(true);
      expect(meta.producesFileRef).toBe(true);
    });

    it("exposes the 5-field config surface that mirrors SlackUploadFileConfigSchema", () => {
      const fields = uploadMeta().fields;
      expect(fields.map((f) => f.name)).toEqual([
        "channel",
        "file",
        "title",
        "initialComment",
        "threadTs",
      ]);
    });

    it("`channel` is a required async combobox sourced from slack:channels (Slice 3.32)", () => {
      const channel = uploadMeta().fields.find((f) => f.name === "channel")!;
      expect(channel.type).toBe("combobox");
      expect(channel.required).toBe(true);
      expect(channel.optionsSource).toBe("slack:channels");
      // Mutually exclusive with static options per FieldMetaSchema's
      // superRefine — pinning this prevents drift.
      expect(channel.options).toBeUndefined();
    });

    it("`file` is a required file field (exercises the Slice 3.25 single-FileRef FileField)", () => {
      const file = uploadMeta().fields.find((f) => f.name === "file")!;
      expect(file.type).toBe("file");
      expect(file.required).toBe(true);
    });

    it("`title` / `initialComment` / `threadTs` are optional text/textarea fields", () => {
      const title = uploadMeta().fields.find((f) => f.name === "title")!;
      expect(title.type).toBe("text");
      expect(title.required).toBe(false);
      const initialComment = uploadMeta().fields.find(
        (f) => f.name === "initialComment",
      )!;
      expect(initialComment.type).toBe("textarea");
      expect(initialComment.required).toBe(false);
      const threadTs = uploadMeta().fields.find((f) => f.name === "threadTs")!;
      expect(threadTs.type).toBe("text");
      expect(threadTs.required).toBe(false);
    });

    it("output `file` is a fileRef chip; siblings are bounded scalars (no bytes / base64 / content / data)", () => {
      const outputs = uploadMeta().outputs;
      const file = outputs.find((o) => o.name === "file");
      expect(file).toBeDefined();
      expect(file!.type).toBe("fileRef");
      const names = outputs.map((o) => o.name);
      expect(names).toEqual(["file", "fileId", "permalink", "channelIds"]);
      for (const banned of ["bytes", "base64", "content", "data"]) {
        expect(names).not.toContain(banned);
      }
    });
  });

  describe("Notion full surface (Slices 3.41 + 3.42 — 16/16 coverage)", () => {
    function notionActionMetas() {
      return listActionMetasForProvider("notion");
    }

    it("Slices 3.41 + 3.42 together register all 16 Notion action metas in displayOrder", () => {
      const metas = notionActionMetas();
      expect(metas.map((m) => m.key)).toEqual([
        // Slice 3.41 — pages + databases (displayOrder 10..90).
        "notion:create_page",
        "notion:update_page",
        "notion:archive_page",
        "notion:restore_page",
        "notion:get_page",
        "notion:create_database",
        "notion:create_database_entry",
        "notion:query_database",
        "notion:search",
        // Slice 3.42 — blocks + comments + users (displayOrder 100..160).
        "notion:append_block_children",
        "notion:get_block",
        "notion:get_block_children",
        "notion:create_comment",
        "notion:list_comments",
        "notion:get_user",
        "notion:list_users",
      ]);
    });

    it("every Notion action meta declares provider=notion, category=data, requiresIntegration=true, no FileRef", () => {
      const metas = notionActionMetas();
      expect(metas).toHaveLength(16);
      for (const meta of metas) {
        expect(meta.provider).toBe("notion");
        expect(meta.category).toBe("data");
        expect(meta.requiresIntegration).toBe(true);
        expect(meta.producesFileRef).toBe(false);
        expect(meta.consumesFileRef).toBe(false);
      }
    });

    it("Notion displayOrders are unique within the provider", () => {
      const orders = notionActionMetas().map((m) => m.displayOrder);
      expect(new Set(orders).size).toBe(orders.length);
      for (const o of orders) {
        expect(o).not.toBeNull();
      }
    });

    it("`startCursor` is NEVER exposed in any Notion meta (server-managed pagination)", () => {
      for (const meta of notionActionMetas()) {
        const names = meta.fields.map((f) => f.name);
        expect(names).not.toContain("startCursor");
      }
    });

    it("ID fields (pageId, databaseId, parentPageId, etc.) are `text` (resolvers deferred to Slice 3.43+)", () => {
      const idFieldNames = new Set([
        "pageId",
        "databaseId",
        "parentPageId",
      ]);
      for (const meta of notionActionMetas()) {
        for (const f of meta.fields) {
          if (idFieldNames.has(f.name)) {
            expect(f.type).toBe("text");
            expect(f.optionsSource).toBeUndefined();
          }
        }
      }
    });

    it("nested-object fields (parent, properties, children, icon, cover, filter, sorts) are `textarea` (paste-JSON UX)", () => {
      const jsonFieldNames = new Set([
        "parent",
        "properties",
        "children",
        "icon",
        "cover",
        "filter",
        "sorts",
      ]);
      for (const meta of notionActionMetas()) {
        for (const f of meta.fields) {
          if (jsonFieldNames.has(f.name)) {
            expect(f.type).toBe("textarea");
            expect(f.placeholder).toBeDefined();
          }
        }
      }
    });

    it("`pageSize` fields use number with min:1 / max:100 / integer (Notion's hard ceiling)", () => {
      for (const meta of notionActionMetas()) {
        const pageSize = meta.fields.find((f) => f.name === "pageSize");
        if (pageSize) {
          expect(pageSize.type).toBe("number");
          expect(pageSize.required).toBe(false);
          expect(pageSize.numeric?.min).toBe(1);
          expect(pageSize.numeric?.max).toBe(100);
          expect(pageSize.numeric?.integer).toBe(true);
        }
      }
    });

    it("no Notion output exposes raw bytes/base64/content/data sibling fields", () => {
      const banned = ["bytes", "base64", "data"];
      for (const meta of notionActionMetas()) {
        const names = meta.outputs.map((o) => o.name);
        for (const b of banned) {
          expect(names).not.toContain(b);
        }
      }
    });

    describe("create_page field surface", () => {
      function createPageMeta() {
        return notionActionMetas().find((m) => m.key === "notion:create_page")!;
      }

      it("exposes parent / properties / children / icon / cover", () => {
        expect(createPageMeta().fields.map((f) => f.name)).toEqual([
          "parent",
          "properties",
          "children",
          "icon",
          "cover",
        ]);
      });

      it("parent + properties are required textareas; children/icon/cover are optional textareas", () => {
        const byName = new Map(
          createPageMeta().fields.map((f) => [f.name, f]),
        );
        expect(byName.get("parent")!.type).toBe("textarea");
        expect(byName.get("parent")!.required).toBe(true);
        expect(byName.get("properties")!.type).toBe("textarea");
        expect(byName.get("properties")!.required).toBe(true);
        for (const optional of ["children", "icon", "cover"]) {
          expect(byName.get(optional)!.type).toBe("textarea");
          expect(byName.get(optional)!.required).toBe(false);
        }
      });

      it("output is {pageId, url, parent:object, createdTime, lastEditedTime}", () => {
        const outputs = createPageMeta().outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "pageId",
          "url",
          "parent",
          "createdTime",
          "lastEditedTime",
        ]);
        expect(outputs.find((o) => o.name === "parent")!.type).toBe("object");
      });
    });

    describe("update_page field surface", () => {
      function updatePageMeta() {
        return notionActionMetas().find((m) => m.key === "notion:update_page")!;
      }

      it("pageId is required text; properties/icon/cover are optional textareas; archived is optional boolean", () => {
        const byName = new Map(
          updatePageMeta().fields.map((f) => [f.name, f]),
        );
        expect(byName.get("pageId")!.type).toBe("text");
        expect(byName.get("pageId")!.required).toBe(true);
        expect(byName.get("properties")!.type).toBe("textarea");
        expect(byName.get("properties")!.required).toBe(false);
        expect(byName.get("icon")!.type).toBe("textarea");
        expect(byName.get("icon")!.required).toBe(false);
        expect(byName.get("cover")!.type).toBe("textarea");
        expect(byName.get("cover")!.required).toBe(false);
        expect(byName.get("archived")!.type).toBe("boolean");
        expect(byName.get("archived")!.required).toBe(false);
      });

      it("description mentions the runtime cross-field 'at least one mutating field' invariant", () => {
        expect(updatePageMeta().description.toLowerCase()).toContain(
          "at least one mutating field",
        );
      });

      it("output is {pageId, url, archived, lastEditedTime}", () => {
        expect(updatePageMeta().outputs.map((o) => o.name)).toEqual([
          "pageId",
          "url",
          "archived",
          "lastEditedTime",
        ]);
      });
    });

    describe("archive_page / restore_page / get_page id-only field surface", () => {
      it.each([
        "notion:archive_page",
        "notion:restore_page",
        "notion:get_page",
      ])("%s exposes only pageId (required text)", (key) => {
        const meta = notionActionMetas().find((m) => m.key === key)!;
        expect(meta.fields.map((f) => f.name)).toEqual(["pageId"]);
        const pageId = meta.fields[0]!;
        expect(pageId.type).toBe("text");
        expect(pageId.required).toBe(true);
      });

      it("archive_page output is {pageId, url, archived, lastEditedTime}", () => {
        const meta = notionActionMetas().find(
          (m) => m.key === "notion:archive_page",
        )!;
        expect(meta.outputs.map((o) => o.name)).toEqual([
          "pageId",
          "url",
          "archived",
          "lastEditedTime",
        ]);
      });

      it("get_page output exposes parent/icon/cover as objects + skippedProperties as array", () => {
        const meta = notionActionMetas().find(
          (m) => m.key === "notion:get_page",
        )!;
        const outputs = new Map(meta.outputs.map((o) => [o.name, o]));
        expect(outputs.get("parent")!.type).toBe("object");
        expect(outputs.get("icon")!.type).toBe("object");
        expect(outputs.get("cover")!.type).toBe("object");
        expect(outputs.get("properties")!.type).toBe("object");
        expect(outputs.get("skippedProperties")!.type).toBe("array");
      });
    });

    describe("create_database field surface", () => {
      function createDatabaseMeta() {
        return notionActionMetas().find(
          (m) => m.key === "notion:create_database",
        )!;
      }

      it("exposes parentPageId / title / description / isInline / properties", () => {
        expect(createDatabaseMeta().fields.map((f) => f.name)).toEqual([
          "parentPageId",
          "title",
          "description",
          "isInline",
          "properties",
        ]);
      });

      it("parentPageId+title+properties required; description/isInline optional", () => {
        const byName = new Map(
          createDatabaseMeta().fields.map((f) => [f.name, f]),
        );
        expect(byName.get("parentPageId")!.required).toBe(true);
        expect(byName.get("title")!.required).toBe(true);
        expect(byName.get("description")!.required).toBe(false);
        expect(byName.get("description")!.type).toBe("textarea");
        expect(byName.get("isInline")!.required).toBe(false);
        expect(byName.get("isInline")!.type).toBe("boolean");
        expect(byName.get("properties")!.required).toBe(true);
        expect(byName.get("properties")!.type).toBe("textarea");
      });

      it("description mentions the 'exactly one title property' runtime invariant", () => {
        expect(createDatabaseMeta().description.toLowerCase()).toContain(
          "exactly one property of type 'title'",
        );
      });

      it("output includes databaseId + bounded scalars + properties object", () => {
        const outputs = createDatabaseMeta().outputs;
        expect(outputs.map((o) => o.name)).toEqual([
          "databaseId",
          "object",
          "url",
          "title",
          "description",
          "archived",
          "isInline",
          "parentType",
          "parentId",
          "createdTime",
          "lastEditedTime",
          "properties",
        ]);
        expect(outputs.find((o) => o.name === "properties")!.type).toBe(
          "object",
        );
      });
    });

    describe("create_database_entry field surface", () => {
      function createEntryMeta() {
        return notionActionMetas().find(
          (m) => m.key === "notion:create_database_entry",
        )!;
      }

      it("exposes databaseId / properties / children / icon / cover", () => {
        expect(createEntryMeta().fields.map((f) => f.name)).toEqual([
          "databaseId",
          "properties",
          "children",
          "icon",
          "cover",
        ]);
      });

      it("databaseId text + required; properties textarea + required; children/icon/cover optional textarea", () => {
        const byName = new Map(
          createEntryMeta().fields.map((f) => [f.name, f]),
        );
        expect(byName.get("databaseId")!.type).toBe("text");
        expect(byName.get("databaseId")!.required).toBe(true);
        expect(byName.get("properties")!.type).toBe("textarea");
        expect(byName.get("properties")!.required).toBe(true);
        for (const optional of ["children", "icon", "cover"]) {
          expect(byName.get(optional)!.type).toBe("textarea");
          expect(byName.get(optional)!.required).toBe(false);
        }
      });

      it("output mirrors create_page", () => {
        expect(createEntryMeta().outputs.map((o) => o.name)).toEqual([
          "pageId",
          "url",
          "parent",
          "createdTime",
          "lastEditedTime",
        ]);
      });
    });

    describe("query_database field surface", () => {
      function queryMeta() {
        return notionActionMetas().find(
          (m) => m.key === "notion:query_database",
        )!;
      }

      it("exposes databaseId / filter / sorts / pageSize and OMITS startCursor", () => {
        const names = queryMeta().fields.map((f) => f.name);
        expect(names).toEqual(["databaseId", "filter", "sorts", "pageSize"]);
        expect(names).not.toContain("startCursor");
      });

      it("databaseId required text; filter/sorts optional textareas; pageSize optional number 1..100", () => {
        const byName = new Map(queryMeta().fields.map((f) => [f.name, f]));
        expect(byName.get("databaseId")!.type).toBe("text");
        expect(byName.get("databaseId")!.required).toBe(true);
        expect(byName.get("filter")!.type).toBe("textarea");
        expect(byName.get("filter")!.required).toBe(false);
        expect(byName.get("sorts")!.type).toBe("textarea");
        expect(byName.get("sorts")!.required).toBe(false);
        const pageSize = byName.get("pageSize")!;
        expect(pageSize.type).toBe("number");
        expect(pageSize.required).toBe(false);
        expect(pageSize.numeric?.min).toBe(1);
        expect(pageSize.numeric?.max).toBe(100);
      });

      it("output is {results: array, hasMore: boolean, nextCursor: string}", () => {
        const outputs = new Map(
          queryMeta().outputs.map((o) => [o.name, o]),
        );
        expect(outputs.get("results")!.type).toBe("array");
        expect(outputs.get("hasMore")!.type).toBe("boolean");
        expect(outputs.get("nextCursor")!.type).toBe("string");
      });
    });

    describe("search field surface", () => {
      function searchMeta() {
        return notionActionMetas().find((m) => m.key === "notion:search")!;
      }

      it("exposes query / filter / pageSize and OMITS startCursor", () => {
        const names = searchMeta().fields.map((f) => f.name);
        expect(names).toEqual(["query", "filter", "pageSize"]);
        expect(names).not.toContain("startCursor");
      });

      it("query required text (empty allowed per Notion API); filter optional textarea; pageSize optional number", () => {
        const byName = new Map(searchMeta().fields.map((f) => [f.name, f]));
        expect(byName.get("query")!.type).toBe("text");
        expect(byName.get("query")!.required).toBe(true);
        expect(byName.get("filter")!.type).toBe("textarea");
        expect(byName.get("filter")!.required).toBe(false);
        expect(byName.get("pageSize")!.type).toBe("number");
        expect(byName.get("pageSize")!.required).toBe(false);
      });

      it("output is {results: array, hasMore: boolean, nextCursor: string}", () => {
        const outputs = new Map(
          searchMeta().outputs.map((o) => [o.name, o]),
        );
        expect(outputs.get("results")!.type).toBe("array");
        expect(outputs.get("hasMore")!.type).toBe("boolean");
        expect(outputs.get("nextCursor")!.type).toBe("string");
      });
    });

    describe("Slice 3.42 — blocks + comments + users surface (closes Notion at 16/16)", () => {
      it("Slice 3.42 registers all 7 remaining action metas in displayOrder", () => {
        const slice42Keys = notionActionMetas()
          .filter((m) => (m.displayOrder ?? 0) >= 100)
          .map((m) => m.key);
        expect(slice42Keys).toEqual([
          "notion:append_block_children",
          "notion:get_block",
          "notion:get_block_children",
          "notion:create_comment",
          "notion:list_comments",
          "notion:get_user",
          "notion:list_users",
        ]);
      });

      describe("append_block_children field surface", () => {
        function meta() {
          return notionActionMetas().find(
            (m) => m.key === "notion:append_block_children",
          )!;
        }

        it("exposes blockId (required text) + children (required textarea)", () => {
          const fields = meta().fields;
          expect(fields.map((f) => f.name)).toEqual(["blockId", "children"]);
          const byName = new Map(fields.map((f) => [f.name, f]));
          expect(byName.get("blockId")!.type).toBe("text");
          expect(byName.get("blockId")!.required).toBe(true);
          expect(byName.get("children")!.type).toBe("textarea");
          expect(byName.get("children")!.required).toBe(true);
        });

        it("blockId description mentions dual block-id / page-id semantics", () => {
          const blockId = meta().fields.find((f) => f.name === "blockId")!;
          expect(blockId.description?.toLowerCase()).toContain("page id");
        });

        it("children description mentions the ≤100 cap and BlockSpec shape", () => {
          const children = meta().fields.find((f) => f.name === "children")!;
          expect(children.description?.toLowerCase()).toContain("blockspec");
          expect(children.description).toContain("100");
        });

        it("output is {childIds: array, count: number}", () => {
          expect(meta().outputs.map((o) => o.name)).toEqual([
            "childIds",
            "count",
          ]);
          const byName = new Map(meta().outputs.map((o) => [o.name, o]));
          expect(byName.get("childIds")!.type).toBe("array");
          expect(byName.get("count")!.type).toBe("number");
        });
      });

      describe("get_block field surface", () => {
        function meta() {
          return notionActionMetas().find((m) => m.key === "notion:get_block")!;
        }

        it("exposes only blockId (required text)", () => {
          expect(meta().fields.map((f) => f.name)).toEqual(["blockId"]);
          const blockId = meta().fields[0]!;
          expect(blockId.type).toBe("text");
          expect(blockId.required).toBe(true);
        });

        it("output exposes plainText: string + content: object + bounded scalars", () => {
          expect(meta().outputs.map((o) => o.name)).toEqual([
            "blockId",
            "object",
            "type",
            "archived",
            "hasChildren",
            "parentType",
            "parentId",
            "createdTime",
            "lastEditedTime",
            "plainText",
            "content",
          ]);
          const outputs = new Map(meta().outputs.map((o) => [o.name, o]));
          expect(outputs.get("plainText")!.type).toBe("string");
          expect(outputs.get("content")!.type).toBe("object");
          expect(outputs.get("hasChildren")!.type).toBe("boolean");
        });
      });

      describe("get_block_children field surface", () => {
        function meta() {
          return notionActionMetas().find(
            (m) => m.key === "notion:get_block_children",
          )!;
        }

        it("exposes blockId / pageSize and OMITS startCursor", () => {
          const names = meta().fields.map((f) => f.name);
          expect(names).toEqual(["blockId", "pageSize"]);
          expect(names).not.toContain("startCursor");
        });

        it("blockId required text; pageSize optional number 1..100", () => {
          const byName = new Map(meta().fields.map((f) => [f.name, f]));
          expect(byName.get("blockId")!.type).toBe("text");
          expect(byName.get("blockId")!.required).toBe(true);
          const pageSize = byName.get("pageSize")!;
          expect(pageSize.type).toBe("number");
          expect(pageSize.required).toBe(false);
          expect(pageSize.numeric?.min).toBe(1);
          expect(pageSize.numeric?.max).toBe(100);
          expect(pageSize.numeric?.integer).toBe(true);
        });

        it("output is {blocks: array, nextCursor: string, hasMore: boolean}", () => {
          const outputs = new Map(meta().outputs.map((o) => [o.name, o]));
          expect(outputs.get("blocks")!.type).toBe("array");
          expect(outputs.get("nextCursor")!.type).toBe("string");
          expect(outputs.get("hasMore")!.type).toBe("boolean");
        });
      });

      describe("create_comment field surface", () => {
        function meta() {
          return notionActionMetas().find(
            (m) => m.key === "notion:create_comment",
          )!;
        }

        it("exposes pageId (optional) / discussionId (optional) / text (required textarea)", () => {
          expect(meta().fields.map((f) => f.name)).toEqual([
            "pageId",
            "discussionId",
            "text",
          ]);
          const byName = new Map(meta().fields.map((f) => [f.name, f]));
          expect(byName.get("pageId")!.type).toBe("text");
          expect(byName.get("pageId")!.required).toBe(false);
          expect(byName.get("discussionId")!.type).toBe("text");
          expect(byName.get("discussionId")!.required).toBe(false);
          expect(byName.get("text")!.type).toBe("textarea");
          expect(byName.get("text")!.required).toBe(true);
        });

        it("description documents the XOR runtime invariant (exactly one of pageId / discussionId)", () => {
          const desc = meta().description.toLowerCase();
          expect(desc).toContain("exactly one");
          expect(desc).toContain("page id");
          expect(desc).toContain("discussion id");
        });

        it("output exposes commentId + discussionId + plainText + bounded scalars", () => {
          expect(meta().outputs.map((o) => o.name)).toEqual([
            "commentId",
            "object",
            "parentType",
            "parentId",
            "parentBlockId",
            "discussionId",
            "plainText",
            "createdTime",
            "lastEditedTime",
            "createdByUserId",
          ]);
        });
      });

      describe("list_comments field surface", () => {
        function meta() {
          return notionActionMetas().find(
            (m) => m.key === "notion:list_comments",
          )!;
        }

        it("exposes blockId / pageSize and OMITS startCursor", () => {
          const names = meta().fields.map((f) => f.name);
          expect(names).toEqual(["blockId", "pageSize"]);
          expect(names).not.toContain("startCursor");
        });

        it("output is {comments: array, nextCursor: string, hasMore: boolean}", () => {
          const outputs = new Map(meta().outputs.map((o) => [o.name, o]));
          expect(outputs.get("comments")!.type).toBe("array");
          expect(outputs.get("nextCursor")!.type).toBe("string");
          expect(outputs.get("hasMore")!.type).toBe("boolean");
        });
      });

      describe("get_user field surface", () => {
        function meta() {
          return notionActionMetas().find((m) => m.key === "notion:get_user")!;
        }

        it("exposes only userId (required notion:users combobox)", () => {
          expect(meta().fields.map((f) => f.name)).toEqual(["userId"]);
          const userId = meta().fields[0]!;
          expect(userId.type).toBe("combobox");
          expect(userId.optionsSource).toBe("notion:users");
          expect(userId.required).toBe(true);
        });

        it("output mirrors the handler's flat user projection (person+bot polymorphism)", () => {
          expect(meta().outputs.map((o) => o.name)).toEqual([
            "userId",
            "object",
            "type",
            "name",
            "avatarUrl",
            "personEmail",
            "botOwnerType",
            "botOwnerUserId",
            "botWorkspaceName",
          ]);
        });
      });

      describe("list_users field surface", () => {
        function meta() {
          return notionActionMetas().find((m) => m.key === "notion:list_users")!;
        }

        it("exposes only pageSize (optional number 1..100) — no channel, no startCursor", () => {
          const names = meta().fields.map((f) => f.name);
          expect(names).toEqual(["pageSize"]);
          expect(names).not.toContain("startCursor");
          const pageSize = meta().fields[0]!;
          expect(pageSize.type).toBe("number");
          expect(pageSize.required).toBe(false);
          expect(pageSize.numeric?.min).toBe(1);
          expect(pageSize.numeric?.max).toBe(100);
        });

        it("output is {users: array, nextCursor: string, hasMore: boolean}", () => {
          const outputs = new Map(meta().outputs.map((o) => [o.name, o]));
          expect(outputs.get("users")!.type).toBe("array");
          expect(outputs.get("nextCursor")!.type).toBe("string");
          expect(outputs.get("hasMore")!.type).toBe("boolean");
        });
      });
    });
  });

  describe("Stripe action surface (Slices 3.45 + 3.46 — full 16/16 coverage)", () => {
    function stripeActionMetas() {
      return listActionMetasForProvider("stripe");
    }

    it("registers all 16 Stripe action metas in displayOrder (8 lifecycle + 8 subscriptions/commerce)", () => {
      const metas = stripeActionMetas();
      expect(metas.map((m) => m.key)).toEqual([
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
    });

    it("Slice 3.46 group contains exactly 8 new metas", () => {
      const slice346Keys = new Set([
        "stripe:create_subscription",
        "stripe:update_subscription",
        "stripe:cancel_subscription",
        "stripe:find_subscription",
        "stripe:create_checkout_session",
        "stripe:create_payment_link",
        "stripe:create_invoice",
        "stripe:get_payments",
      ]);
      const matched = stripeActionMetas().filter((m) =>
        slice346Keys.has(m.key),
      );
      expect(matched).toHaveLength(8);
    });

    it("every Stripe meta declares provider=stripe, category=commerce, requiresIntegration=true, no FileRef", () => {
      const metas = stripeActionMetas();
      expect(metas).toHaveLength(16);
      for (const meta of metas) {
        expect(meta.provider).toBe("stripe");
        expect(meta.category).toBe("commerce");
        expect(meta.requiresIntegration).toBe(true);
        expect(meta.producesFileRef).toBe(false);
        expect(meta.consumesFileRef).toBe(false);
      }
    });

    it("Stripe displayOrders are unique within the provider", () => {
      const orders = stripeActionMetas().map((m) => m.displayOrder);
      expect(new Set(orders).size).toBe(orders.length);
      for (const o of orders) {
        expect(o).not.toBeNull();
      }
    });

    it("ID fields (customerId, paymentIntentId, chargeId, subscriptionId, priceId, invoiceId) are `text` (resolvers deferred to follow-up)", () => {
      const idFieldNames = new Set([
        "customerId",
        "paymentIntentId",
        "chargeId",
        "subscriptionId",
        "priceId",
        "invoiceId",
      ]);
      for (const meta of stripeActionMetas()) {
        for (const f of meta.fields) {
          if (idFieldNames.has(f.name)) {
            expect(f.type).toBe("text");
            expect(f.optionsSource).toBeUndefined();
          }
        }
      }
    });

    it("every `metadata` field is a `keyvalue` field with keyValueMaxRows=50 (Stripe's per-object cap)", () => {
      let foundCount = 0;
      for (const meta of stripeActionMetas()) {
        const md = meta.fields.find((f) => f.name === "metadata");
        if (md) {
          expect(md.type).toBe("keyvalue");
          expect(md.required).toBe(false);
          expect(md.keyValueMaxRows).toBe(50);
          foundCount += 1;
        }
      }
      // 9 actions in the full 16/16 surface have a metadata field:
      // create_customer, update_customer, create_payment_intent,
      // create_refund (Slice 3.45) + create_subscription,
      // update_subscription, create_checkout_session,
      // create_payment_link, create_invoice (Slice 3.46).
      expect(foundCount).toBe(9);
    });

    it("nested fields: lineItems is a structured object-list; automaticTax/afterCompletion stay JSON textareas behind the Advanced disclosure (CONFIG-UX-AUDIT-1)", () => {
      let foundCount = 0;
      for (const meta of stripeActionMetas()) {
        for (const f of meta.fields) {
          if (f.name === "lineItems") {
            // Visual repeater writing the REAL [{priceId, quantity}] array
            // the runtime schema expects — never a JSON-encoded string.
            expect(f.type).toBe("object-list");
            expect(f.itemFields?.map((s) => s.name)).toEqual([
              "priceId",
              "quantity",
            ]);
            expect(f.advanced).toBeUndefined();
            foundCount += 1;
          }
          if (f.name === "automaticTax" || f.name === "afterCompletion") {
            // Developer escape hatches — JSON copy allowed ONLY because the
            // field is marked advanced (collapsed out of the normal path).
            expect(f.type).toBe("textarea");
            expect(f.advanced).toBe(true);
            foundCount += 1;
          }
        }
      }
      // lineItems on create_checkout_session + create_payment_link;
      // automaticTax on create_checkout_session; afterCompletion on
      // create_payment_link.
      expect(foundCount).toBe(4);
    });

    it("money/subscription-changing boolean+enum fields carry NO defaultValue (Q11 — no hidden destructive defaults)", () => {
      const riskyFields: Record<string, ReadonlyArray<string>> = {
        "stripe:create_subscription": [
          "payment_behavior",
          "trialPeriodDays",
        ],
        "stripe:update_subscription": [
          "cancel_at_period_end",
          "proration_behavior",
          "collection_method",
          "days_until_due",
        ],
        "stripe:cancel_subscription": [
          "at_period_end",
          "invoice_now",
          "prorate",
        ],
        "stripe:create_checkout_session": ["allowPromotionCodes"],
        "stripe:create_payment_link": ["allowPromotionCodes"],
        "stripe:create_invoice": ["autoAdvance"],
        "stripe:get_payments": ["limit"],
      };
      for (const [metaKey, names] of Object.entries(riskyFields)) {
        const meta = stripeActionMetas().find((m) => m.key === metaKey)!;
        expect(meta).toBeDefined();
        for (const name of names) {
          const field = meta.fields.find((f) => f.name === name);
          expect(field).toBeDefined();
          expect(field!.defaultValue).toBeUndefined();
        }
      }
    });

    it("cancel_subscription description carries cancellation-risk language (DESTRUCTIVE + immediate semantics)", () => {
      const d = stripeActionMetas()
        .find((m) => m.key === "stripe:cancel_subscription")!
        .description.toLowerCase();
      expect(d).toContain("destructive");
      expect(d).toContain("immediate");
    });

    it("create_invoice description clarifies autoAdvance finalization/collection behavior (MONEY-MOVING when omitted)", () => {
      const d = stripeActionMetas()
        .find((m) => m.key === "stripe:create_invoice")!
        .description.toLowerCase();
      expect(d).toContain("money-moving");
      expect(d).toContain("autoadvance");
    });

    it("checkout/payment-link/invoice URL outputs are present where the handler returns them (intended customer-facing Stripe URLs)", () => {
      // create_checkout_session.url, create_payment_link.url,
      // create_invoice.{hostedInvoiceUrl, invoicePdf}.
      const sessionMeta = stripeActionMetas().find(
        (m) => m.key === "stripe:create_checkout_session",
      )!;
      expect(sessionMeta.outputs.map((o) => o.name)).toContain("url");

      const linkMeta = stripeActionMetas().find(
        (m) => m.key === "stripe:create_payment_link",
      )!;
      expect(linkMeta.outputs.map((o) => o.name)).toContain("url");

      const invoiceMeta = stripeActionMetas().find(
        (m) => m.key === "stripe:create_invoice",
      )!;
      const invoiceOutputs = invoiceMeta.outputs.map((o) => o.name);
      expect(invoiceOutputs).toContain("hostedInvoiceUrl");
      expect(invoiceOutputs).toContain("invoicePdf");
    });

    it("no output exposes raw bytes/base64/data sibling fields (no FileRef on Stripe in this slice)", () => {
      const banned = ["bytes", "base64", "data"];
      for (const meta of stripeActionMetas()) {
        const names = meta.outputs.map((o) => o.name);
        for (const b of banned) {
          expect(names).not.toContain(b);
        }
      }
    });

    it("no Stripe output is named clientSecret (Slice 3.SEC-8 — full ban)", () => {
      // Pre-SEC-8 this test allowed clientSecret on create/confirm
      // payment_intent for "Payment Element handoff." SEC-8 removed
      // clientSecret from those handler projections entirely — see
      // `integrations/stripe/actions/createPaymentIntent.ts` JSDoc.
      // The check is now a hard ban across the whole Stripe surface.
      for (const meta of stripeActionMetas()) {
        const names = meta.outputs.map((o) => o.name);
        expect(names).not.toContain("clientSecret");
        // Reject other secret-shaped output names regardless of action.
        for (const banned of [
          "apiKey",
          "secretKey",
          "webhookSecret",
          "stripeKey",
          "card",
          "cardNumber",
          "cvc",
        ]) {
          expect(names).not.toContain(banned);
        }
      }
    });

    describe("create_customer field surface", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:create_customer",
        )!;
      }

      it("exposes email / name / description / metadata (no payment method fields)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "email",
          "name",
          "description",
          "metadata",
        ]);
        // Defensive — make sure we don't accidentally surface card /
        // payment-method fields here.
        for (const banned of ["payment_method", "card", "source"]) {
          expect(meta().fields.find((f) => f.name === banned)).toBeUndefined();
        }
      });

      it("email is required text; name/description/metadata are optional", () => {
        const byName = new Map(meta().fields.map((f) => [f.name, f]));
        expect(byName.get("email")!.type).toBe("text");
        expect(byName.get("email")!.required).toBe(true);
        expect(byName.get("name")!.required).toBe(false);
        expect(byName.get("description")!.required).toBe(false);
        expect(byName.get("metadata")!.required).toBe(false);
      });

      it("output is the 7-key bounded customer projection (no clientSecret leakage)", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual([
          "customerId",
          "email",
          "name",
          "description",
          "created",
          "livemode",
          "metadata",
        ]);
        expect(names).not.toContain("clientSecret");
      });
    });

    describe("find_customer XOR field surface", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:find_customer",
        )!;
      }

      it("exposes customerId + email, both optional (XOR enforced at runtime)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "customerId",
          "email",
        ]);
        const byName = new Map(meta().fields.map((f) => [f.name, f]));
        expect(byName.get("customerId")!.required).toBe(false);
        expect(byName.get("email")!.required).toBe(false);
      });

      it("description documents the EXACTLY ONE XOR invariant", () => {
        expect(meta().description.toLowerCase()).toContain("exactly one");
      });

      it("output is {found, customer}", () => {
        expect(meta().outputs.map((o) => o.name)).toEqual([
          "found",
          "customer",
        ]);
      });
    });

    describe("create_payment_intent — DOLLARS unit anchoring + clientSecret", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:create_payment_intent",
        )!;
      }

      it("exposes amount / currency / customerId / description / metadata", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "amount",
          "currency",
          "customerId",
          "description",
          "metadata",
        ]);
      });

      it("amount is required number with min:0.01, step:0.01 (DOLLARS, not integer)", () => {
        const amount = meta().fields.find((f) => f.name === "amount")!;
        expect(amount.type).toBe("number");
        expect(amount.required).toBe(true);
        expect(amount.numeric?.min).toBe(0.01);
        expect(amount.numeric?.step).toBe(0.01);
        expect(amount.numeric?.integer).not.toBe(true);
      });

      it("amount description anchors the DOLLARS unit (catches dollars/cents drift)", () => {
        const amount = meta().fields.find((f) => f.name === "amount")!;
        expect(amount.label.toLowerCase()).toContain("dollar");
        expect(amount.description?.toLowerCase()).toContain("dollar");
      });

      it("currency is required text (NOT a 135-option select)", () => {
        const currency = meta().fields.find((f) => f.name === "currency")!;
        expect(currency.type).toBe("text");
        expect(currency.required).toBe(true);
        expect(currency.options).toBeUndefined();
      });

      it("output does NOT include clientSecret (Slice 3.SEC-8 removal)", () => {
        // Pre-SEC-8 the output included clientSecret for "Payment
        // Element handoff." SEC-8 removed it — the handler projection
        // intentionally drops it before returning. See
        // `createPaymentIntent.ts` JSDoc for the rationale.
        const names = meta().outputs.map((o) => o.name);
        expect(names).not.toContain("clientSecret");
      });

      it("output `amount` description anchors the CENTS echo (input→output unit asymmetry)", () => {
        const out = meta().outputs.find((o) => o.name === "amount")!;
        expect(out.description?.toLowerCase()).toContain("cent");
      });

      it("output includes `nextAction` as an object (3DS / off-session descriptor)", () => {
        const na = meta().outputs.find((o) => o.name === "nextAction")!;
        expect(na.type).toBe("object");
      });
    });

    describe("capture_payment_intent — CENTS unit anchoring (footgun guard)", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:capture_payment_intent",
        )!;
      }

      it("exposes paymentIntentId + amount_to_capture", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "paymentIntentId",
          "amount_to_capture",
        ]);
      });

      it("amount_to_capture is OPTIONAL number with integer:true, min:1 (CENTS)", () => {
        const a = meta().fields.find((f) => f.name === "amount_to_capture")!;
        expect(a.type).toBe("number");
        expect(a.required).toBe(false);
        expect(a.numeric?.min).toBe(1);
        expect(a.numeric?.integer).toBe(true);
      });

      it("amount_to_capture description anchors the CENTS unit (footgun guard vs create_payment_intent.amount=DOLLARS)", () => {
        const a = meta().fields.find((f) => f.name === "amount_to_capture")!;
        expect(a.label.toLowerCase()).toContain("cent");
        expect(a.description?.toLowerCase()).toContain("cent");
      });

      it("no defaultValue (Q11 — no hidden destructive default)", () => {
        const a = meta().fields.find((f) => f.name === "amount_to_capture")!;
        expect(a.defaultValue).toBeUndefined();
      });

      it("top-level description warns that capture is NOT reversible without a refund", () => {
        expect(meta().description.toLowerCase()).toContain("not reversible");
      });
    });

    describe("confirm_payment_intent — snake_case field names + bounded output (no clientSecret)", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:confirm_payment_intent",
        )!;
      }

      it("preserves snake_case schema field names (payment_method / receipt_email / return_url)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "paymentIntentId",
          "payment_method",
          "receipt_email",
          "return_url",
        ]);
      });

      it("output does NOT include clientSecret (Slice 3.SEC-8 removal)", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).not.toContain("clientSecret");
      });
    });

    describe("create_refund — destructive money-flow + XOR + reason enum", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:create_refund",
        )!;
      }

      it("exposes chargeId + paymentIntentId + amount + reason + metadata (all optional or XOR)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "chargeId",
          "paymentIntentId",
          "amount",
          "reason",
          "metadata",
        ]);
        const byName = new Map(meta().fields.map((f) => [f.name, f]));
        expect(byName.get("chargeId")!.required).toBe(false);
        expect(byName.get("paymentIntentId")!.required).toBe(false);
        expect(byName.get("amount")!.required).toBe(false);
        expect(byName.get("reason")!.required).toBe(false);
        expect(byName.get("metadata")!.required).toBe(false);
      });

      it("description warns DESTRUCTIVE + EXACTLY ONE XOR + full-refund default behavior", () => {
        const d = meta().description.toLowerCase();
        expect(d).toContain("destructive");
        expect(d).toContain("exactly one");
        expect(d).toContain("full refund");
      });

      it("amount is number with DOLLARS unit anchoring (matches create_payment_intent)", () => {
        const a = meta().fields.find((f) => f.name === "amount")!;
        expect(a.type).toBe("number");
        expect(a.numeric?.min).toBe(0.01);
        expect(a.numeric?.step).toBe(0.01);
        expect(a.label.toLowerCase()).toContain("dollar");
        expect(a.description?.toLowerCase()).toContain("dollar");
      });

      it("reason is `select` with Stripe's 3 enum values and NO defaultValue (Q11)", () => {
        const r = meta().fields.find((f) => f.name === "reason")!;
        expect(r.type).toBe("select");
        expect(r.required).toBe(false);
        expect(r.defaultValue).toBeUndefined();
        const values = r.options?.map((o) => o.value);
        expect(values).toEqual([
          "duplicate",
          "fraudulent",
          "requested_by_customer",
        ]);
      });
    });

    describe("find_payment_intent read-only surface", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:find_payment_intent",
        )!;
      }

      it("exposes only paymentIntentId (required text)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual(["paymentIntentId"]);
        const pi = meta().fields[0]!;
        expect(pi.type).toBe("text");
        expect(pi.required).toBe(true);
      });

      it("output is {found, paymentIntent}; no clientSecret leakage on the read path", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual(["found", "paymentIntent"]);
        expect(names).not.toContain("clientSecret");
      });
    });

    describe("create_subscription — money-moving recurring billing", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:create_subscription",
        )!;
      }

      it("requires customerId + priceId; payment_behavior / trialPeriodDays / metadata / default_payment_method optional", () => {
        const byName = new Map(meta().fields.map((f) => [f.name, f]));
        expect(byName.get("customerId")!.required).toBe(true);
        expect(byName.get("priceId")!.required).toBe(true);
        expect(byName.get("default_payment_method")!.required).toBe(false);
        expect(byName.get("payment_behavior")!.required).toBe(false);
        expect(byName.get("trialPeriodDays")!.required).toBe(false);
        expect(byName.get("metadata")!.required).toBe(false);
      });

      it("payment_behavior is `select` with Stripe's 4 enum values and NO defaultValue (Q11)", () => {
        const pb = meta().fields.find((f) => f.name === "payment_behavior")!;
        expect(pb.type).toBe("select");
        expect(pb.defaultValue).toBeUndefined();
        const values = pb.options?.map((o) => o.value);
        expect(values).toEqual([
          "allow_incomplete",
          "default_incomplete",
          "error_if_incomplete",
          "pending_if_incomplete",
        ]);
      });

      it("trialPeriodDays is integer-only number with min:1 (Q11 — no default)", () => {
        const t = meta().fields.find((f) => f.name === "trialPeriodDays")!;
        expect(t.type).toBe("number");
        expect(t.numeric?.integer).toBe(true);
        expect(t.numeric?.min).toBe(1);
        expect(t.defaultValue).toBeUndefined();
      });

      it("description warns money-moving recurring billing", () => {
        expect(meta().description.toLowerCase()).toContain("money-moving");
      });

      it("output is the 12-key bounded subscription projection (no clientSecret leakage)", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual([
          "subscriptionId",
          "customerId",
          "status",
          "currentPeriodStart",
          "currentPeriodEnd",
          "cancelAtPeriodEnd",
          "trialStart",
          "trialEnd",
          "priceId",
          "quantity",
          "created",
          "metadata",
        ]);
        expect(names).not.toContain("clientSecret");
      });
    });

    describe("update_subscription — proration + collection enums (no hidden defaults)", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:update_subscription",
        )!;
      }

      it("only subscriptionId is required; every other field optional", () => {
        const byName = new Map(meta().fields.map((f) => [f.name, f]));
        expect(byName.get("subscriptionId")!.required).toBe(true);
        for (const name of [
          "priceId",
          "quantity",
          "trial_end",
          "cancel_at_period_end",
          "proration_behavior",
          "default_payment_method",
          "metadata",
          "collection_method",
          "days_until_due",
        ]) {
          expect(byName.get(name)!.required).toBe(false);
        }
      });

      it("proration_behavior is `select` with 3 enum values and NO defaultValue", () => {
        const pb = meta().fields.find((f) => f.name === "proration_behavior")!;
        expect(pb.type).toBe("select");
        expect(pb.defaultValue).toBeUndefined();
        expect(pb.options?.map((o) => o.value)).toEqual([
          "create_prorations",
          "none",
          "always_invoice",
        ]);
      });

      it("collection_method is `select` with 2 enum values and NO defaultValue", () => {
        const cm = meta().fields.find((f) => f.name === "collection_method")!;
        expect(cm.type).toBe("select");
        expect(cm.defaultValue).toBeUndefined();
        expect(cm.options?.map((o) => o.value)).toEqual([
          "charge_automatically",
          "send_invoice",
        ]);
      });

      it("trial_end is `text` (accepts Unix timestamp OR literal 'now')", () => {
        const t = meta().fields.find((f) => f.name === "trial_end")!;
        expect(t.type).toBe("text");
        expect(t.description?.toLowerCase()).toContain("now");
      });

      it("description warns money-moving (priceId/quantity/proration changes affect invoices)", () => {
        expect(meta().description.toLowerCase()).toContain("money-moving");
      });
    });

    describe("cancel_subscription — destructive + cancellation-risk semantics", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:cancel_subscription",
        )!;
      }

      it("exposes subscriptionId + at_period_end + invoice_now + prorate", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "subscriptionId",
          "at_period_end",
          "invoice_now",
          "prorate",
        ]);
      });

      it("at_period_end / invoice_now / prorate are boolean with NO defaultValue (Q11)", () => {
        for (const name of ["at_period_end", "invoice_now", "prorate"]) {
          const f = meta().fields.find((ff) => ff.name === name)!;
          expect(f.type).toBe("boolean");
          expect(f.required).toBe(false);
          expect(f.defaultValue).toBeUndefined();
        }
      });

      it("description includes destructive + immediate + billing-access language", () => {
        const d = meta().description.toLowerCase();
        expect(d).toContain("destructive");
        expect(d).toContain("billing access");
        expect(d).toContain("immediate");
      });

      it("output is the 7-key bounded cancellation projection (no clientSecret leakage)", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual([
          "subscriptionId",
          "status",
          "canceledAt",
          "cancelAtPeriodEnd",
          "currentPeriodEnd",
          "customerId",
          "endedAt",
        ]);
        expect(names).not.toContain("clientSecret");
      });
    });

    describe("find_subscription read-only surface", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:find_subscription",
        )!;
      }

      it("exposes only subscriptionId (required text)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual(["subscriptionId"]);
        const f = meta().fields[0]!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("output is {found, subscription}; no clientSecret/card leakage", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual(["found", "subscription"]);
        for (const banned of ["clientSecret", "card", "cardNumber"]) {
          expect(names).not.toContain(banned);
        }
      });
    });

    describe("create_checkout_session — mode select + lineItems paste-JSON + XOR customer/email + customer-facing URL output", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:create_checkout_session",
        )!;
      }

      it("exposes mode / successUrl / cancelUrl / lineItems / customer / customerEmail / clientReferenceId / metadata / allowPromotionCodes / automaticTax in order", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "mode",
          "successUrl",
          "cancelUrl",
          "lineItems",
          "customer",
          "customerEmail",
          "clientReferenceId",
          "metadata",
          "allowPromotionCodes",
          "automaticTax",
        ]);
      });

      it("mode is `select` with payment/subscription/setup; required; NO defaultValue", () => {
        const m = meta().fields.find((f) => f.name === "mode")!;
        expect(m.type).toBe("select");
        expect(m.required).toBe(true);
        expect(m.defaultValue).toBeUndefined();
        expect(m.options?.map((o) => o.value)).toEqual([
          "payment",
          "subscription",
          "setup",
        ]);
      });

      it("lineItems is a structured object-list (optional at field level; XOR with mode enforced at runtime)", () => {
        const li = meta().fields.find((f) => f.name === "lineItems")!;
        expect(li.type).toBe("object-list");
        expect(li.required).toBe(false);
        expect(li.itemFields?.map((s) => s.name)).toEqual(["priceId", "quantity"]);
        expect(li.listMaxItems).toBe(99);
        expect(li.description?.toLowerCase()).toContain("setup");
        expect(li.description?.toLowerCase()).toContain("required");
      });

      it("customer + customerEmail are both optional with XOR documented in description", () => {
        const byName = new Map(meta().fields.map((f) => [f.name, f]));
        expect(byName.get("customer")!.required).toBe(false);
        expect(byName.get("customerEmail")!.required).toBe(false);
        expect(byName.get("customer")!.description?.toLowerCase()).toContain(
          "mutex",
        );
        expect(
          byName.get("customerEmail")!.description?.toLowerCase(),
        ).toContain("mutex");
        expect(meta().description.toLowerCase()).toContain("exactly one");
      });

      it("automaticTax is textarea paste-JSON (object shape)", () => {
        const at = meta().fields.find((f) => f.name === "automaticTax")!;
        expect(at.type).toBe("textarea");
        expect(at.required).toBe(false);
      });

      it("successUrl/cancelUrl are required text with URL placeholders", () => {
        const byName = new Map(meta().fields.map((f) => [f.name, f]));
        expect(byName.get("successUrl")!.type).toBe("text");
        expect(byName.get("successUrl")!.required).toBe(true);
        expect(byName.get("successUrl")!.placeholder).toMatch(/^https:\/\//);
        expect(byName.get("cancelUrl")!.type).toBe("text");
        expect(byName.get("cancelUrl")!.required).toBe(true);
        expect(byName.get("cancelUrl")!.placeholder).toMatch(/^https:\/\//);
      });

      it("output `url` is the customer-facing Stripe-hosted checkout URL (intentional + safe)", () => {
        const url = meta().outputs.find((o) => o.name === "url")!;
        expect(url.type).toBe("string");
        expect(url.description?.toLowerCase()).toContain("customer-facing");
        expect(url.description?.toLowerCase()).toContain("safe");
      });

      it("output `amountTotal` description anchors CENTS unit (Stripe wire-format)", () => {
        const at = meta().outputs.find((o) => o.name === "amountTotal")!;
        expect(at.description?.toLowerCase()).toContain("cent");
      });
    });

    describe("create_payment_link — required lineItems paste-JSON + URL output", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:create_payment_link",
        )!;
      }

      it("exposes lineItems / metadata / allowPromotionCodes / afterCompletion", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "lineItems",
          "metadata",
          "allowPromotionCodes",
          "afterCompletion",
        ]);
      });

      it("lineItems is a REQUIRED structured object-list", () => {
        const li = meta().fields.find((f) => f.name === "lineItems")!;
        expect(li.type).toBe("object-list");
        expect(li.required).toBe(true);
        expect(li.itemFields?.map((s) => s.name)).toEqual(["priceId", "quantity"]);
        expect(li.listMaxItems).toBe(20);
      });

      it("afterCompletion is an OPTIONAL advanced JSON textarea (discriminated union)", () => {
        const ac = meta().fields.find((f) => f.name === "afterCompletion")!;
        expect(ac.type).toBe("textarea");
        expect(ac.required).toBe(false);
        expect(ac.advanced).toBe(true);
        expect(ac.description?.toLowerCase()).toContain("redirect");
        expect(ac.description?.toLowerCase()).toContain("hosted_confirmation");
      });

      it("output `url` is the customer-facing Stripe-hosted payment URL", () => {
        const url = meta().outputs.find((o) => o.name === "url")!;
        expect(url.type).toBe("string");
        expect(url.description?.toLowerCase()).toContain("customer-facing");
      });
    });

    describe("create_invoice — autoAdvance finalization risk + hostedInvoiceUrl/invoicePdf outputs", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:create_invoice",
        )!;
      }

      it("exposes customerId / description / metadata / autoAdvance", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "customerId",
          "description",
          "metadata",
          "autoAdvance",
        ]);
      });

      it("autoAdvance is boolean with NO defaultValue (Q11) and description warns of Stripe server-side `true` default", () => {
        const a = meta().fields.find((f) => f.name === "autoAdvance")!;
        expect(a.type).toBe("boolean");
        expect(a.required).toBe(false);
        expect(a.defaultValue).toBeUndefined();
        expect(a.description?.toLowerCase()).toContain("money-moving");
        expect(a.description?.toLowerCase()).toContain("true");
      });

      it("description is the autoAdvance finalization warning", () => {
        const d = meta().description.toLowerCase();
        expect(d).toContain("money-moving");
        expect(d).toContain("autoadvance");
        expect(d).toContain("finalization");
      });

      it("output exposes hostedInvoiceUrl + invoicePdf with customer-facing intent", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("hostedInvoiceUrl")!.description?.toLowerCase())
          .toContain("customer-facing");
        expect(byName.get("invoicePdf")!.description?.toLowerCase())
          .toContain("customer-facing");
      });

      it("output `amountDue` / `amountPaid` descriptions anchor CENTS unit", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("amountDue")!.description?.toLowerCase()).toContain(
          "cent",
        );
        expect(byName.get("amountPaid")!.description?.toLowerCase()).toContain(
          "cent",
        );
      });
    });

    describe("get_payments — pagination cursors + bounded payments output", () => {
      function meta() {
        return stripeActionMetas().find(
          (m) => m.key === "stripe:get_payments",
        )!;
      }

      it("exposes customer / limit / startingAfter / endingBefore (no startCursor / endCursor server-managed handles)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "customer",
          "limit",
          "startingAfter",
          "endingBefore",
        ]);
      });

      it("limit is OPTIONAL number with integer:true + min:1 + max:100 (Stripe API ceiling); NO defaultValue", () => {
        const l = meta().fields.find((f) => f.name === "limit")!;
        expect(l.type).toBe("number");
        expect(l.required).toBe(false);
        expect(l.numeric?.min).toBe(1);
        expect(l.numeric?.max).toBe(100);
        expect(l.numeric?.integer).toBe(true);
        expect(l.defaultValue).toBeUndefined();
      });

      it("startingAfter + endingBefore are text with mutex documented in descriptions", () => {
        const byName = new Map(meta().fields.map((f) => [f.name, f]));
        expect(byName.get("startingAfter")!.type).toBe("text");
        expect(byName.get("endingBefore")!.type).toBe("text");
        expect(byName.get("startingAfter")!.description?.toLowerCase()).toContain(
          "mutex",
        );
        expect(byName.get("endingBefore")!.description?.toLowerCase()).toContain(
          "mutex",
        );
      });

      it("output is {payments[], count, hasMore, nextCursor} — bounded shape", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual(["payments", "count", "hasMore", "nextCursor"]);
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("payments")!.type).toBe("array");
        expect(byName.get("count")!.type).toBe("number");
        expect(byName.get("hasMore")!.type).toBe("boolean");
        expect(byName.get("nextCursor")!.type).toBe("string");
      });
    });
  });

  // ─── Google Sheets (Slices 3.GSHEETS-3 + 3.GSHEETS-4 — 12/12 coverage) ──
  //
  // Pinned full surface. GSHEETS-3 shipped read + simple-write (8);
  // GSHEETS-4 closes with destructive (clear_range, delete_row), bulk
  // (batch_update), and formatting (format_range). Same slice flips
  // google-sheets into COVERED_PROVIDERS — 1:1 handler↔meta drift is
  // enforced from here on.
  describe("Google Sheets action surface (Slices 3.GSHEETS-3 + 3.GSHEETS-4 — full 12/12 coverage)", () => {
    function gsheetsActionMetas() {
      return listActionMetasForProvider("google-sheets");
    }
    function gsheetsTriggerMetas() {
      return listTriggerMetasForProvider("google-sheets");
    }

    it("registers all 12 Google Sheets action metas in displayOrder (8 GSHEETS-3 + 4 GSHEETS-4)", () => {
      const metas = gsheetsActionMetas();
      expect(metas.map((m) => m.key)).toEqual([
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
    });

    it("Slice 3.GSHEETS-4 group contains exactly 4 new action metas", () => {
      const slice4Keys = new Set([
        "google-sheets:clear_range",
        "google-sheets:delete_row",
        "google-sheets:batch_update",
        "google-sheets:format_range",
      ]);
      const matched = gsheetsActionMetas().filter((m) => slice4Keys.has(m.key));
      expect(matched).toHaveLength(4);
    });

    it("every Google Sheets meta declares provider=google-sheets, category=data, requiresIntegration=true, no FileRef", () => {
      const metas = gsheetsActionMetas();
      expect(metas).toHaveLength(12);
      for (const meta of metas) {
        expect(meta.provider).toBe("google-sheets");
        expect(meta.category).toBe("data");
        expect(meta.requiresIntegration).toBe(true);
        expect(meta.producesFileRef).toBe(false);
        expect(meta.consumesFileRef).toBe(false);
      }
    });

    it("Google Sheets displayOrders are unique within the provider", () => {
      const orders = gsheetsActionMetas().map((m) => m.displayOrder);
      expect(new Set(orders).size).toBe(orders.length);
      for (const o of orders) {
        expect(o).not.toBeNull();
      }
    });

    it("every spreadsheetId field uses the `google-sheets:spreadsheets` resolver (11/12 — create_spreadsheet creates a new file)", () => {
      // create_spreadsheet has no spreadsheetId field — it CREATES the
      // spreadsheet rather than pointing at one. Everyone else uses the
      // GSHEETS-2 picker.
      const expectSpreadsheetField = [
        "google-sheets:read_rows",
        "google-sheets:get_cell_value",
        "google-sheets:get_sheet_metadata",
        "google-sheets:find_row",
        "google-sheets:append_row",
        "google-sheets:update_row",
        "google-sheets:update_cell",
        // GSHEETS-4 additions.
        "google-sheets:clear_range",
        "google-sheets:delete_row",
        "google-sheets:batch_update",
        "google-sheets:format_range",
      ];
      for (const key of expectSpreadsheetField) {
        const meta = gsheetsActionMetas().find((m) => m.key === key)!;
        const f = meta.fields.find((x) => x.name === "spreadsheetId");
        expect(f).toBeDefined();
        expect(f!.type).toBe("combobox");
        expect(f!.optionsSource).toBe("google-sheets:spreadsheets");
        expect(f!.required).toBe(true);
      }
      // create_spreadsheet explicitly does NOT carry a spreadsheetId.
      const create = gsheetsActionMetas().find(
        (m) => m.key === "google-sheets:create_spreadsheet",
      )!;
      expect(create.fields.find((x) => x.name === "spreadsheetId")).toBeUndefined();
    });

    it("every sheetName field uses the `google-sheets:sheets` resolver with dependsOn=spreadsheetId (5 actions across the 12-action surface)", () => {
      const expectSheetField = [
        "google-sheets:get_cell_value",
        "google-sheets:find_row",
        "google-sheets:update_cell",
        // GSHEETS-4: delete_row resolves sheetName→sheetId via the
        // handler; format_range receives bare A1 + sheetName separately.
        "google-sheets:delete_row",
        "google-sheets:format_range",
      ];
      for (const key of expectSheetField) {
        const meta = gsheetsActionMetas().find((m) => m.key === key)!;
        const f = meta.fields.find((x) => x.name === "sheetName");
        expect(f).toBeDefined();
        expect(f!.type).toBe("combobox");
        expect(f!.optionsSource).toBe("google-sheets:sheets");
        expect(f!.dependsOn).toBe("spreadsheetId");
        expect(f!.required).toBe(true);
      }
    });

    it("append_row / update_row / clear_range / batch_update do NOT expose a sheetName field — schemas accept `range` only (slice rule: use exact runtime field names)", () => {
      for (const key of [
        "google-sheets:append_row",
        "google-sheets:update_row",
        // GSHEETS-4: clear_range schema is { spreadsheetId, range };
        // batch_update schema is { spreadsheetId, valueInputOption,
        // updates[] } where each update's range carries its own sheet
        // prefix.
        "google-sheets:clear_range",
        "google-sheets:batch_update",
      ]) {
        const meta = gsheetsActionMetas().find((m) => m.key === key)!;
        expect(meta.fields.map((f) => f.name)).not.toContain("sheetName");
      }
      // append_row / update_row / clear_range each expose `range` as
      // required text. batch_update is the exception — `updates` is a
      // textarea paste-JSON containing the per-update ranges.
      for (const key of [
        "google-sheets:append_row",
        "google-sheets:update_row",
        "google-sheets:clear_range",
      ]) {
        const meta = gsheetsActionMetas().find((m) => m.key === key)!;
        const range = meta.fields.find((f) => f.name === "range");
        expect(range).toBeDefined();
        expect(range!.type).toBe("text");
        expect(range!.required).toBe(true);
      }
      const batch = gsheetsActionMetas().find(
        (m) => m.key === "google-sheets:batch_update",
      )!;
      expect(batch.fields.find((f) => f.name === "range")).toBeUndefined();
      const updates = batch.fields.find((f) => f.name === "updates")!;
      expect(updates.type).toBe("textarea");
      expect(updates.required).toBe(true);
    });

    it("get_sheet_metadata exposes spreadsheetId ONLY — no sheetName picker (schema is single-field)", () => {
      const meta = gsheetsActionMetas().find(
        (m) => m.key === "google-sheets:get_sheet_metadata",
      )!;
      expect(meta.fields.map((f) => f.name)).toEqual(["spreadsheetId"]);
    });

    describe("read_rows field + output surface", () => {
      function meta() {
        return gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:read_rows",
        )!;
      }

      it("exposes spreadsheetId / range / majorDimension / valueRenderOption", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "spreadsheetId",
          "range",
          "majorDimension",
          "valueRenderOption",
        ]);
      });

      it("range is required text", () => {
        const f = meta().fields.find((x) => x.name === "range")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("majorDimension is a required select defaulting to ROWS", () => {
        const f = meta().fields.find((x) => x.name === "majorDimension")!;
        expect(f.type).toBe("select");
        expect(f.required).toBe(true);
        expect(f.defaultValue).toBe("ROWS");
        expect(f.options!.map((o) => o.value).sort()).toEqual([
          "COLUMNS",
          "ROWS",
        ]);
      });

      it("valueRenderOption is an optional select with the 3 Sheets enum values", () => {
        const f = meta().fields.find((x) => x.name === "valueRenderOption")!;
        expect(f.type).toBe("select");
        expect(f.required).toBe(false);
        expect(f.options!.map((o) => o.value).sort()).toEqual([
          "FORMATTED_VALUE",
          "FORMULA",
          "UNFORMATTED_VALUE",
        ]);
      });

      it("outputs are {range, majorDimension, values, count} — `values` sensitive", () => {
        expect(meta().outputs.map((o) => o.name)).toEqual([
          "range",
          "majorDimension",
          "values",
          "count",
        ]);
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("values")!.sensitive).toBe(true);
        expect(byName.get("count")!.sensitive).toBeFalsy();
        expect(byName.get("range")!.sensitive).toBeFalsy();
        expect(byName.get("majorDimension")!.sensitive).toBeFalsy();
      });
    });

    describe("get_cell_value field + output surface", () => {
      function meta() {
        return gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:get_cell_value",
        )!;
      }

      it("exposes spreadsheetId / sheetName / cell", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "spreadsheetId",
          "sheetName",
          "cell",
        ]);
      });

      it("cell is required text", () => {
        const f = meta().fields.find((x) => x.name === "cell")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("`value` output is sensitive (cell content can be PII)", () => {
        const value = meta().outputs.find((o) => o.name === "value")!;
        expect(value.sensitive).toBe(true);
      });
    });

    describe("find_row field + output surface", () => {
      function meta() {
        return gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:find_row",
        )!;
      }

      it("exposes spreadsheetId / sheetName / column / value / operator / returnAll", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "spreadsheetId",
          "sheetName",
          "column",
          "value",
          "operator",
          "returnAll",
        ]);
      });

      it("operator is a required select with single value `equals` (Batch 1 narrowing)", () => {
        const f = meta().fields.find((x) => x.name === "operator")!;
        expect(f.type).toBe("select");
        expect(f.required).toBe(true);
        expect(f.defaultValue).toBe("equals");
        expect(f.options!.map((o) => o.value)).toEqual(["equals"]);
      });

      it("returnAll is an optional boolean with defaultValue false", () => {
        const f = meta().fields.find((x) => x.name === "returnAll")!;
        expect(f.type).toBe("boolean");
        expect(f.required).toBe(false);
        expect(f.defaultValue).toBe(false);
      });

      it("`firstMatch` and `matches` outputs are sensitive (row content can be PII)", () => {
        const firstMatch = meta().outputs.find((o) => o.name === "firstMatch")!;
        const matches = meta().outputs.find((o) => o.name === "matches")!;
        expect(firstMatch.sensitive).toBe(true);
        expect(matches.sensitive).toBe(true);
        const found = meta().outputs.find((o) => o.name === "found")!;
        const count = meta().outputs.find((o) => o.name === "count")!;
        expect(found.sensitive).toBeFalsy();
        expect(count.sensitive).toBeFalsy();
      });
    });

    describe("create_spreadsheet field + output surface", () => {
      function meta() {
        return gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:create_spreadsheet",
        )!;
      }

      it("exposes title (required) + initialSheetName (optional)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "title",
          "initialSheetName",
        ]);
        const byName = new Map(meta().fields.map((f) => [f.name, f]));
        expect(byName.get("title")!.required).toBe(true);
        expect(byName.get("initialSheetName")!.required).toBe(false);
      });

      it("is riskLevel=medium with a riskDescription explaining the create semantic", () => {
        expect(meta().riskLevel).toBe("medium");
        expect(meta().riskDescription).toBeDefined();
        expect(meta().riskDescription!.length).toBeGreaterThan(0);
      });

      it("spreadsheetUrl output is structural (NOT sensitive — standard share URL, not signed)", () => {
        const url = meta().outputs.find((o) => o.name === "spreadsheetUrl")!;
        expect(url).toBeDefined();
        expect(url.sensitive).toBeFalsy();
      });
    });

    describe("append_row / update_row write surface", () => {
      it("append_row exposes spreadsheetId / range / values / valueInputOption / insertDataOption", () => {
        const meta = gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:append_row",
        )!;
        expect(meta.fields.map((f) => f.name)).toEqual([
          "spreadsheetId",
          "range",
          "values",
          "valueInputOption",
          "insertDataOption",
        ]);
      });

      it("update_row exposes spreadsheetId / range / values / valueInputOption (no insertDataOption — schema omits it)", () => {
        const meta = gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:update_row",
        )!;
        expect(meta.fields.map((f) => f.name)).toEqual([
          "spreadsheetId",
          "range",
          "values",
          "valueInputOption",
        ]);
      });

      it("values is a required string-array chip editor on both write actions (CONFIG-UX-AUDIT-1 — writes a REAL array, never a JSON string)", () => {
        for (const key of [
          "google-sheets:append_row",
          "google-sheets:update_row",
        ]) {
          const meta = gsheetsActionMetas().find((m) => m.key === key)!;
          const f = meta.fields.find((x) => x.name === "values")!;
          expect(f.type).toBe("string-array");
          expect(f.required).toBe(true);
        }
      });

      it("valueInputOption is a required select with NO defaultValue (Q11 — no hidden destructive defaults)", () => {
        for (const key of [
          "google-sheets:append_row",
          "google-sheets:update_row",
          "google-sheets:update_cell",
        ]) {
          const meta = gsheetsActionMetas().find((m) => m.key === key)!;
          const f = meta.fields.find((x) => x.name === "valueInputOption")!;
          expect(f.type).toBe("select");
          expect(f.required).toBe(true);
          expect(f.defaultValue).toBeUndefined();
          expect(f.options!.map((o) => o.value).sort()).toEqual([
            "RAW",
            "USER_ENTERED",
          ]);
        }
      });

      it("append_row insertDataOption is a required select defaulting to INSERT_ROWS (mirrors schema's .default)", () => {
        const meta = gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:append_row",
        )!;
        const f = meta.fields.find((x) => x.name === "insertDataOption")!;
        expect(f.type).toBe("select");
        expect(f.required).toBe(true);
        expect(f.defaultValue).toBe("INSERT_ROWS");
        expect(f.options!.map((o) => o.value).sort()).toEqual([
          "INSERT_ROWS",
          "OVERWRITE",
        ]);
      });

      it("write actions are riskLevel=medium with a riskDescription (recoverable mutation — NOT high)", () => {
        for (const key of [
          "google-sheets:append_row",
          "google-sheets:update_row",
          "google-sheets:update_cell",
        ]) {
          const meta = gsheetsActionMetas().find((m) => m.key === key)!;
          expect(meta.riskLevel).toBe("medium");
          expect(meta.isDestructive).toBe(false);
          expect(meta.requiresConfirmation).toBe(false);
          expect(meta.riskDescription).toBeDefined();
          expect(meta.riskDescription!.length).toBeGreaterThan(0);
        }
      });

      it("write-action outputs are structural counters only — no sensitive flag", () => {
        for (const key of [
          "google-sheets:append_row",
          "google-sheets:update_row",
          "google-sheets:update_cell",
        ]) {
          const meta = gsheetsActionMetas().find((m) => m.key === key)!;
          for (const o of meta.outputs) {
            expect(o.sensitive).toBeFalsy();
          }
        }
      });
    });

    it("no Google Sheets output is named with a banned secret pattern (defense in depth)", () => {
      const banned = new Set([
        "token",
        "accessToken",
        "refreshToken",
        "clientSecret",
        "secret",
        "apiKey",
      ]);
      for (const meta of gsheetsActionMetas()) {
        for (const o of meta.outputs) {
          expect(banned.has(o.name)).toBe(false);
        }
      }
    });

    it("read actions stay low; recoverable writes stay medium; destructive writes are high (12-action risk matrix)", () => {
      const expectedRisk: Record<string, "low" | "medium" | "high"> = {
        // GSHEETS-3.
        "google-sheets:read_rows": "low",
        "google-sheets:get_cell_value": "low",
        "google-sheets:get_sheet_metadata": "low",
        "google-sheets:find_row": "low",
        "google-sheets:create_spreadsheet": "medium",
        "google-sheets:append_row": "medium",
        "google-sheets:update_row": "medium",
        "google-sheets:update_cell": "medium",
        // GSHEETS-4.
        "google-sheets:clear_range": "high",
        "google-sheets:delete_row": "high",
        "google-sheets:batch_update": "medium",
        "google-sheets:format_range": "low",
      };
      for (const meta of gsheetsActionMetas()) {
        expect(meta.riskLevel).toBe(expectedRisk[meta.key]);
      }
    });

    describe("destructive actions (Slice 3.GSHEETS-4 — clear_range + delete_row)", () => {
      const DESTRUCTIVE_KEYS = [
        "google-sheets:clear_range",
        "google-sheets:delete_row",
      ] as const;

      for (const key of DESTRUCTIVE_KEYS) {
        it(`${key} declares isDestructive + requiresConfirmation + riskLevel=high + non-empty riskDescription`, () => {
          const meta = gsheetsActionMetas().find((m) => m.key === key)!;
          expect(meta).toBeDefined();
          expect(meta.isDestructive).toBe(true);
          expect(meta.requiresConfirmation).toBe(true);
          expect(meta.riskLevel).toBe("high");
          expect(meta.riskDescription).toBeDefined();
          expect(meta.riskDescription!.length).toBeGreaterThan(0);
        });
      }

      it("riskDescription on clear_range explains it clears cell values (not formatting/validation)", () => {
        const meta = gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:clear_range",
        )!;
        const d = meta.riskDescription!.toLowerCase();
        expect(d).toContain("clear");
      });

      it("riskDescription on delete_row explains row removal + downstream shift", () => {
        const meta = gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:delete_row",
        )!;
        const d = meta.riskDescription!.toLowerCase();
        expect(d).toContain("delete");
        expect(d).toContain("shift");
      });

      it("clear_range field surface — spreadsheetId combobox + range text only", () => {
        const meta = gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:clear_range",
        )!;
        expect(meta.fields.map((f) => f.name)).toEqual([
          "spreadsheetId",
          "range",
        ]);
      });

      it("delete_row field surface — spreadsheetId / sheetName / rowNumber (integer ≥1)", () => {
        const meta = gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:delete_row",
        )!;
        expect(meta.fields.map((f) => f.name)).toEqual([
          "spreadsheetId",
          "sheetName",
          "rowNumber",
        ]);
        const rowNumber = meta.fields.find((f) => f.name === "rowNumber")!;
        expect(rowNumber.type).toBe("number");
        expect(rowNumber.required).toBe(true);
        expect(rowNumber.numeric?.min).toBe(1);
        expect(rowNumber.numeric?.integer).toBe(true);
      });

      it("destructive action outputs are structural only — no sensitive flag, no cell content echoed", () => {
        for (const key of DESTRUCTIVE_KEYS) {
          const meta = gsheetsActionMetas().find((m) => m.key === key)!;
          for (const o of meta.outputs) {
            expect(o.sensitive).toBeFalsy();
          }
        }
      });
    });

    describe("batch_update surface (Slice 3.GSHEETS-4 — bulk write)", () => {
      function meta() {
        return gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:batch_update",
        )!;
      }

      it("exposes spreadsheetId / valueInputOption / updates", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "spreadsheetId",
          "valueInputOption",
          "updates",
        ]);
      });

      it("valueInputOption is required select with NO defaultValue (Q11)", () => {
        const f = meta().fields.find((x) => x.name === "valueInputOption")!;
        expect(f.type).toBe("select");
        expect(f.required).toBe(true);
        expect(f.defaultValue).toBeUndefined();
        expect(f.options!.map((o) => o.value).sort()).toEqual([
          "RAW",
          "USER_ENTERED",
        ]);
      });

      it("updates is a required textarea (paste-JSON; UI stores literal string)", () => {
        const f = meta().fields.find((x) => x.name === "updates")!;
        expect(f.type).toBe("textarea");
        expect(f.required).toBe(true);
      });

      it("outputs are structural totals + per-update counters — no sensitive flag", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual([
          "spreadsheetId",
          "totalUpdatedRanges",
          "totalUpdatedCells",
          "totalUpdatedRows",
          "totalUpdatedColumns",
          "responses",
        ]);
        for (const o of meta().outputs) {
          expect(o.sensitive).toBeFalsy();
        }
      });

      it("is riskLevel=medium with a riskDescription (overwrites recoverable only by re-writing)", () => {
        expect(meta().riskLevel).toBe("medium");
        expect(meta().isDestructive).toBe(false);
        expect(meta().requiresConfirmation).toBe(false);
        expect(meta().riskDescription).toBeDefined();
        expect(meta().riskDescription!.length).toBeGreaterThan(0);
      });
    });

    describe("format_range surface (Slice 3.GSHEETS-4 — formatting)", () => {
      function meta() {
        return gsheetsActionMetas().find(
          (m) => m.key === "google-sheets:format_range",
        )!;
      }

      it("exposes spreadsheetId / sheetName / range / 5 typed format fields (numberFormat paste-JSON)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "spreadsheetId",
          "sheetName",
          "range",
          "backgroundColor",
          "textColor",
          "bold",
          "italic",
          "horizontalAlignment",
          "numberFormat",
        ]);
      });

      it("range is required text (BARE A1 — no sheet prefix; sheetName supplies the sheet)", () => {
        const range = meta().fields.find((f) => f.name === "range")!;
        expect(range.type).toBe("text");
        expect(range.required).toBe(true);
      });

      it("horizontalAlignment is an optional select with the 3 Sheets enum values", () => {
        const f = meta().fields.find((x) => x.name === "horizontalAlignment")!;
        expect(f.type).toBe("select");
        expect(f.required).toBe(false);
        expect(f.options!.map((o) => o.value).sort()).toEqual([
          "CENTER",
          "LEFT",
          "RIGHT",
        ]);
      });

      it("numberFormat is an optional textarea (paste-JSON matches schema's nested object shape)", () => {
        const f = meta().fields.find((x) => x.name === "numberFormat")!;
        expect(f.type).toBe("textarea");
        expect(f.required).toBe(false);
      });

      it("bold + italic are optional booleans (no defaultValue — omit preserves existing state)", () => {
        for (const name of ["bold", "italic"]) {
          const f = meta().fields.find((x) => x.name === name)!;
          expect(f.type).toBe("boolean");
          expect(f.required).toBe(false);
          expect(f.defaultValue).toBeUndefined();
        }
      });

      it("is riskLevel=low (formatting only; cell values preserved)", () => {
        expect(meta().riskLevel).toBe("low");
        expect(meta().isDestructive).toBe(false);
        expect(meta().requiresConfirmation).toBe(false);
      });

      it("outputs are structural — appliedFormat object echo + structural ids", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual([
          "spreadsheetId",
          "sheetName",
          "sheetId",
          "formattedRange",
          "appliedFormat",
        ]);
        for (const o of meta().outputs) {
          expect(o.sensitive).toBeFalsy();
        }
      });
    });

    describe("Google Sheets trigger surface (Slice 3.GSHEETS-4 — 2 triggers)", () => {
      it("registers the 2 trigger metas in displayOrder", () => {
        expect(gsheetsTriggerMetas().map((m) => m.key)).toEqual([
          "google-sheets:new_worksheet",
          "google-sheets:row_changed",
        ]);
      });

      it("both triggers declare activation=webhook, requiresIntegration=true, category=data", () => {
        for (const meta of gsheetsTriggerMetas()) {
          expect(meta.activation).toBe("webhook");
          expect(meta.requiresIntegration).toBe(true);
          expect(meta.category).toBe("data");
        }
      });

      describe("new_worksheet trigger", () => {
        function meta() {
          return gsheetsTriggerMetas().find(
            (m) => m.key === "google-sheets:new_worksheet",
          )!;
        }

        it("config is spreadsheetId combobox only (schema is single-field)", () => {
          expect(meta().fields.map((f) => f.name)).toEqual(["spreadsheetId"]);
          const f = meta().fields[0]!;
          expect(f.type).toBe("combobox");
          expect(f.optionsSource).toBe("google-sheets:spreadsheets");
          expect(f.required).toBe(true);
        });

        it("payload is structural worksheet metadata — no sensitive flag", () => {
          const names = meta().payloadShape.map((o) => o.name);
          expect(names).toEqual([
            "changeKind",
            "spreadsheetId",
            "worksheetId",
            "worksheetName",
            "index",
            "sheetType",
          ]);
          for (const o of meta().payloadShape) {
            expect(o.sensitive).toBeFalsy();
          }
        });
      });

      describe("row_changed trigger", () => {
        function meta() {
          return gsheetsTriggerMetas().find(
            (m) => m.key === "google-sheets:row_changed",
          )!;
        }

        it("config exposes spreadsheetId / sheetName cascade + headerRow / changeKinds / snapshotRowLimit / keyColumn", () => {
          expect(meta().fields.map((f) => f.name)).toEqual([
            "spreadsheetId",
            "sheetName",
            "headerRow",
            "changeKinds",
            "snapshotRowLimit",
            "keyColumn",
          ]);
        });

        it("sheetName uses google-sheets:sheets with dependsOn=spreadsheetId", () => {
          const f = meta().fields.find((x) => x.name === "sheetName")!;
          expect(f.type).toBe("combobox");
          expect(f.optionsSource).toBe("google-sheets:sheets");
          expect(f.dependsOn).toBe("spreadsheetId");
          expect(f.required).toBe(true);
        });

        it("changeKinds is a required string-array defaulting to ['added'] (chip input; 3 allowed values documented in description)", () => {
          const f = meta().fields.find((x) => x.name === "changeKinds")!;
          expect(f.type).toBe("string-array");
          expect(f.required).toBe(true);
          expect(f.defaultValue).toEqual(["added"]);
          expect(f.stringArrayMaxItems).toBe(3);
        });

        it("snapshotRowLimit is an optional number with min=100 / max=10000 / integer (mirrors schema bounds)", () => {
          const f = meta().fields.find((x) => x.name === "snapshotRowLimit")!;
          expect(f.type).toBe("number");
          expect(f.required).toBe(false);
          expect(f.numeric?.min).toBe(100);
          expect(f.numeric?.max).toBe(10000);
          expect(f.numeric?.integer).toBe(true);
          expect(f.defaultValue).toBe(1000);
        });

        it("headerRow is optional boolean defaulting to false", () => {
          const f = meta().fields.find((x) => x.name === "headerRow")!;
          expect(f.type).toBe("boolean");
          expect(f.required).toBe(false);
          expect(f.defaultValue).toBe(false);
        });

        it("keyColumn is optional text (description notes the headerRow precondition)", () => {
          const f = meta().fields.find((x) => x.name === "keyColumn")!;
          expect(f.type).toBe("text");
          expect(f.required).toBe(false);
          expect(f.description!.toLowerCase()).toContain("header row");
        });

        it("payload marks rowValues + keyValue + previousValues sensitive; structural fields stay non-sensitive", () => {
          const byName = new Map(meta().payloadShape.map((o) => [o.name, o]));
          expect(byName.get("rowValues")!.sensitive).toBe(true);
          expect(byName.get("keyValue")!.sensitive).toBe(true);
          expect(byName.get("previousValues")!.sensitive).toBe(true);
          // headers / changeKind / rowIndex / etc. stay structural.
          expect(byName.get("headers")!.sensitive).toBeFalsy();
          expect(byName.get("changeKind")!.sensitive).toBeFalsy();
          expect(byName.get("rowIndex")!.sensitive).toBeFalsy();
          expect(byName.get("spreadsheetId")!.sensitive).toBeFalsy();
          expect(byName.get("sheetName")!.sensitive).toBeFalsy();
          expect(byName.get("rowKey")!.sensitive).toBeFalsy();
          expect(byName.get("keyColumn")!.sensitive).toBeFalsy();
        });
      });
    });
  });

  // ─── HubSpot (Slices 3.HUBSPOT-3..5 — 26 of 26 actions) ──────────────────
  //
  // HUBSPOT-3 shipped 6 contact + company metas; HUBSPOT-4 added 7
  // deal + ticket + owners-read metas + first owners-resolver +
  // pipeline/stage cascade consumers; HUBSPOT-5 closes the action
  // surface at 26/26 with engagements (note/task/call/meeting) +
  // list-membership (add/remove) + commerce (products + line items).
  // HubSpot stays OUT of COVERED_PROVIDERS until HUBSPOT-6 (1 trigger
  // meta still pending — `webhook_received`).
  describe("HubSpot action surface (Slices 3.HUBSPOT-3..5 — 26 of 26 action coverage)", () => {
    function hubspotActionMetas() {
      return listActionMetasForProvider("hubspot");
    }

    it("registers the full 26-action surface in displayOrder", () => {
      const metas = hubspotActionMetas();
      expect(metas.map((m) => m.key)).toEqual([
        // HUBSPOT-3 (10..60)
        "hubspot:create_contact",
        "hubspot:update_contact",
        "hubspot:get_contacts",
        "hubspot:create_company",
        "hubspot:update_company",
        "hubspot:get_companies",
        // HUBSPOT-4 (70..130)
        "hubspot:create_deal",
        "hubspot:update_deal",
        "hubspot:get_deals",
        "hubspot:create_ticket",
        "hubspot:update_ticket",
        "hubspot:get_tickets",
        "hubspot:get_owners",
        // HUBSPOT-5 (140..260)
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
    });

    it("every HubSpot meta declares provider=hubspot, category=crm, requiresIntegration=true, no FileRef", () => {
      const metas = hubspotActionMetas();
      expect(metas).toHaveLength(26);
      for (const meta of metas) {
        expect(meta.provider).toBe("hubspot");
        expect(meta.category).toBe("crm");
        expect(meta.requiresIntegration).toBe(true);
        expect(meta.producesFileRef).toBe(false);
        expect(meta.consumesFileRef).toBe(false);
      }
    });

    it("HubSpot displayOrders are unique within the provider", () => {
      const orders = hubspotActionMetas().map((m) => m.displayOrder);
      expect(new Set(orders).size).toBe(orders.length);
      for (const o of orders) {
        expect(o).not.toBeNull();
      }
    });

    it("risk classification: create/update/list-membership/engagement/product actions are medium; reads are low; remove_line_item is the sole high+destructive+confirm action", () => {
      const expectedRisk: Record<string, "low" | "medium" | "high"> = {
        // HUBSPOT-3
        "hubspot:create_contact": "medium",
        "hubspot:update_contact": "medium",
        "hubspot:get_contacts": "low",
        "hubspot:create_company": "medium",
        "hubspot:update_company": "medium",
        "hubspot:get_companies": "low",
        // HUBSPOT-4
        "hubspot:create_deal": "medium",
        "hubspot:update_deal": "medium",
        "hubspot:get_deals": "low",
        "hubspot:create_ticket": "medium",
        "hubspot:update_ticket": "medium",
        "hubspot:get_tickets": "low",
        "hubspot:get_owners": "low",
        // HUBSPOT-5
        "hubspot:create_note": "medium",
        "hubspot:create_task": "medium",
        "hubspot:create_call": "medium",
        "hubspot:create_meeting": "medium",
        "hubspot:add_contact_to_list": "medium",
        "hubspot:remove_from_list": "medium",
        "hubspot:create_product": "medium",
        "hubspot:update_product": "medium",
        "hubspot:get_products": "low",
        "hubspot:create_line_item": "medium",
        "hubspot:update_line_item": "medium",
        "hubspot:get_line_items": "low",
        "hubspot:remove_line_item": "high",
      };
      for (const meta of hubspotActionMetas()) {
        expect(meta.riskLevel).toBe(expectedRisk[meta.key]);
        if (meta.riskLevel === "medium" || meta.riskLevel === "high") {
          expect(meta.riskDescription).toBeDefined();
          expect(meta.riskDescription!.length).toBeGreaterThan(0);
        }
        // remove_line_item is the SOLE destructive HubSpot action;
        // every other HubSpot meta MUST stay non-destructive + no-
        // confirmation. The risk-flag superRefine in actionMeta.ts
        // additionally enforces "isDestructive=true requires
        // riskLevel=high" — pin it from the test side too.
        if (meta.key === "hubspot:remove_line_item") {
          expect(meta.isDestructive).toBe(true);
          expect(meta.requiresConfirmation).toBe(true);
          expect(meta.riskLevel).toBe("high");
        } else {
          expect(meta.isDestructive).toBe(false);
          expect(meta.requiresConfirmation).toBe(false);
        }
      }
    });

    it("HUBSPOT-3 contact / company metas do NOT consume the hubspot:owners resolver — the contact/company schemas have no hubspot_owner_id field", () => {
      // The 4 hubspot_owner_id-bearing HUBSPOT-4 metas live below
      // (create/update deal, create/update ticket). This test pins
      // the contact/company absence so a future change that adds
      // `hubspot:owners` to a contact / company meta forces an
      // explicit decision (and a schema check).
      const contactCompanyKeys = new Set([
        "hubspot:create_contact",
        "hubspot:update_contact",
        "hubspot:get_contacts",
        "hubspot:create_company",
        "hubspot:update_company",
        "hubspot:get_companies",
      ]);
      for (const meta of hubspotActionMetas()) {
        if (!contactCompanyKeys.has(meta.key)) continue;
        const f = meta.fields.find((x) => x.name === "hubspot_owner_id");
        expect(f).toBeUndefined();
      }
    });

    describe("create_contact field surface", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_contact",
        )!;
      }

      it("exposes the schema's 15 fields (email + 13 standard properties + duplicateHandling)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "email",
          "firstname",
          "lastname",
          "phone",
          "company",
          "jobtitle",
          "website",
          "lifecyclestage",
          "hs_lead_status",
          "address",
          "city",
          "state",
          "zip",
          "country",
          "duplicateHandling",
        ]);
      });

      it("email is required text (z.string().email() at the schema level — UI keeps it text per the slice rule)", () => {
        const f = meta().fields.find((x) => x.name === "email")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("duplicateHandling is a required select with defaultValue='fail' + 3 option values", () => {
        const f = meta().fields.find((x) => x.name === "duplicateHandling")!;
        expect(f.type).toBe("select");
        expect(f.required).toBe(true);
        expect(f.defaultValue).toBe("fail");
        expect(f.options!.map((o) => o.value).sort()).toEqual([
          "fail",
          "skip",
          "update",
        ]);
      });

      it("outputs are {contactId, email, firstName, lastName, createdAt, updatedAt, wasUpdate, wasSkip, properties} — email/firstName/lastName/properties sensitive", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual([
          "contactId",
          "email",
          "firstName",
          "lastName",
          "createdAt",
          "updatedAt",
          "wasUpdate",
          "wasSkip",
          "properties",
        ]);
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("email")!.sensitive).toBe(true);
        expect(byName.get("firstName")!.sensitive).toBe(true);
        expect(byName.get("lastName")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
        // Structural fields stay non-sensitive.
        expect(byName.get("contactId")!.sensitive).toBeFalsy();
        expect(byName.get("createdAt")!.sensitive).toBeFalsy();
        expect(byName.get("wasUpdate")!.sensitive).toBeFalsy();
        expect(byName.get("wasSkip")!.sensitive).toBeFalsy();
      });
    });

    describe("update_contact field surface", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:update_contact",
        )!;
      }

      it("contactId is required text (search-by-email picker deferred to follow-up)", () => {
        const f = meta().fields.find((x) => x.name === "contactId")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("every property field is OPTIONAL (runtime enforces 'at least one property')", () => {
        const optionals = meta().fields.filter((f) => f.name !== "contactId");
        for (const f of optionals) {
          expect(f.required).toBe(false);
        }
      });

      it("outputs mark email + firstName + lastName + properties sensitive", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("email")!.sensitive).toBe(true);
        expect(byName.get("firstName")!.sensitive).toBe(true);
        expect(byName.get("lastName")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
      });
    });

    describe("get_contacts field surface", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:get_contacts",
        )!;
      }

      it("exposes limit / after / properties / filterProperty / filterValue", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "limit",
          "after",
          "properties",
          "filterProperty",
          "filterValue",
        ]);
      });

      it("limit is a bounded number (1..100, integer — matches schema cap)", () => {
        const f = meta().fields.find((x) => x.name === "limit")!;
        expect(f.type).toBe("number");
        expect(f.required).toBe(false);
        expect(f.numeric?.min).toBe(1);
        expect(f.numeric?.max).toBe(100);
        expect(f.numeric?.integer).toBe(true);
      });

      it("properties is an optional string-array (matches schema's string|string[] union)", () => {
        const f = meta().fields.find((x) => x.name === "properties")!;
        expect(f.type).toBe("string-array");
        expect(f.required).toBe(false);
      });

      it("contacts output is sensitive (each entry carries PII); count/total/nextCursor/hasMore stay structural", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("contacts")!.sensitive).toBe(true);
        expect(byName.get("count")!.sensitive).toBeFalsy();
        expect(byName.get("total")!.sensitive).toBeFalsy();
        expect(byName.get("nextCursor")!.sensitive).toBeFalsy();
        expect(byName.get("hasMore")!.sensitive).toBeFalsy();
      });
    });

    describe("create_company field surface", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_company",
        )!;
      }

      it("exposes the schema's 15 fields (name + 13 standard properties + duplicateHandling)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "name",
          "domain",
          "phone",
          "website",
          "address",
          "city",
          "state",
          "zip",
          "country",
          "industry",
          "description",
          "annualrevenue",
          "numberofemployees",
          "lifecyclestage",
          "duplicateHandling",
        ]);
      });

      it("name is required text", () => {
        const f = meta().fields.find((x) => x.name === "name")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("numeric-string fields (annualrevenue, numberofemployees) are TEXT, not number — schema is z.string() and HubSpot API expects stringified numerics", () => {
        for (const name of ["annualrevenue", "numberofemployees"]) {
          const f = meta().fields.find((x) => x.name === name)!;
          expect(f.type).toBe("text");
          // Description must call out the numeric-string footgun.
          expect(f.description!.toLowerCase()).toContain("string");
        }
      });

      it("description field is textarea (free-form longer text)", () => {
        const f = meta().fields.find((x) => x.name === "description")!;
        expect(f.type).toBe("textarea");
      });

      it("duplicateHandling is a required select with defaultValue='fail'", () => {
        const f = meta().fields.find((x) => x.name === "duplicateHandling")!;
        expect(f.type).toBe("select");
        expect(f.required).toBe(true);
        expect(f.defaultValue).toBe("fail");
        expect(f.options!.map((o) => o.value).sort()).toEqual([
          "fail",
          "skip",
          "update",
        ]);
      });

      it("outputs mark name + domain + properties sensitive; companyId / timestamps / wasUpdate / wasSkip stay structural", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("name")!.sensitive).toBe(true);
        expect(byName.get("domain")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
        expect(byName.get("companyId")!.sensitive).toBeFalsy();
        expect(byName.get("wasUpdate")!.sensitive).toBeFalsy();
        expect(byName.get("wasSkip")!.sensitive).toBeFalsy();
      });
    });

    describe("update_company / get_companies parity", () => {
      it("update_company.companyId is required text", () => {
        const meta = hubspotActionMetas().find(
          (m) => m.key === "hubspot:update_company",
        )!;
        const f = meta.fields.find((x) => x.name === "companyId")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("get_companies field shape mirrors get_contacts", () => {
        const meta = hubspotActionMetas().find(
          (m) => m.key === "hubspot:get_companies",
        )!;
        expect(meta.fields.map((f) => f.name)).toEqual([
          "limit",
          "after",
          "properties",
          "filterProperty",
          "filterValue",
        ]);
      });

      it("get_companies output marks companies sensitive; pagination scalars stay structural", () => {
        const meta = hubspotActionMetas().find(
          (m) => m.key === "hubspot:get_companies",
        )!;
        const byName = new Map(meta.outputs.map((o) => [o.name, o]));
        expect(byName.get("companies")!.sensitive).toBe(true);
        expect(byName.get("count")!.sensitive).toBeFalsy();
        expect(byName.get("hasMore")!.sensitive).toBeFalsy();
      });
    });

    it("no HubSpot output uses a banned secret name (defense in depth)", () => {
      const banned = new Set([
        "token",
        "accessToken",
        "refreshToken",
        "clientSecret",
        "secret",
        "apiKey",
        "webhookSecret",
      ]);
      for (const meta of hubspotActionMetas()) {
        for (const o of meta.outputs) {
          expect(banned.has(o.name)).toBe(false);
        }
      }
    });

    // ─── HUBSPOT-4 deal + ticket + owners surface ──────────────────────────

    describe("create_deal field surface (Slice 3.HUBSPOT-4)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_deal",
        )!;
      }

      it("exposes the schema's 8 fields ordered for the pipeline→stage cascade UX", () => {
        // Pipeline is listed BEFORE dealstage even though the schema
        // lists pipeline AFTER dealstage — the cascade requires the
        // parent to render above the child.
        expect(meta().fields.map((f) => f.name)).toEqual([
          "dealname",
          "pipeline",
          "dealstage",
          "amount",
          "closedate",
          "dealtype",
          "description",
          "hubspot_owner_id",
        ]);
      });

      it("dealname is required text", () => {
        const f = meta().fields.find((x) => x.name === "dealname")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("pipeline is an optional combobox sourced from hubspot:deal_pipelines", () => {
        const f = meta().fields.find((x) => x.name === "pipeline")!;
        expect(f.type).toBe("combobox");
        expect(f.required).toBe(false);
        expect(f.optionsSource).toBe("hubspot:deal_pipelines");
        expect(f.dependsOn).toBeUndefined();
      });

      it("dealstage is a required combobox sourced from hubspot:deal_stages with dependsOn: pipeline (matches resolver's requiredDeps)", () => {
        const f = meta().fields.find((x) => x.name === "dealstage")!;
        expect(f.type).toBe("combobox");
        expect(f.required).toBe(true);
        expect(f.optionsSource).toBe("hubspot:deal_stages");
        expect(f.dependsOn).toBe("pipeline");
      });

      it("amount is TEXT, not number — schema is z.string() and HubSpot API expects stringified numerics", () => {
        const f = meta().fields.find((x) => x.name === "amount")!;
        expect(f.type).toBe("text");
        expect(f.description!.toLowerCase()).toContain("string");
      });

      it("description is textarea (free-form longer text)", () => {
        const f = meta().fields.find((x) => x.name === "description")!;
        expect(f.type).toBe("textarea");
      });

      it("hubspot_owner_id is an optional combobox sourced from hubspot:owners — first owners-resolver consumer", () => {
        const f = meta().fields.find((x) => x.name === "hubspot_owner_id")!;
        expect(f.type).toBe("combobox");
        expect(f.required).toBe(false);
        expect(f.optionsSource).toBe("hubspot:owners");
      });

      it("outputs are {dealId, dealname, dealstage, pipeline, amount, closedate, createdAt, updatedAt, properties} — dealname/amount/properties sensitive", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual([
          "dealId",
          "dealname",
          "dealstage",
          "pipeline",
          "amount",
          "closedate",
          "createdAt",
          "updatedAt",
          "properties",
        ]);
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("dealname")!.sensitive).toBe(true);
        expect(byName.get("amount")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
        // Structural fields stay non-sensitive.
        expect(byName.get("dealId")!.sensitive).toBeFalsy();
        expect(byName.get("dealstage")!.sensitive).toBeFalsy();
        expect(byName.get("pipeline")!.sensitive).toBeFalsy();
        expect(byName.get("closedate")!.sensitive).toBeFalsy();
        expect(byName.get("createdAt")!.sensitive).toBeFalsy();
        expect(byName.get("updatedAt")!.sensitive).toBeFalsy();
      });
    });

    describe("update_deal field surface (Slice 3.HUBSPOT-4)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:update_deal",
        )!;
      }

      it("dealId is required text (search-by-property picker deferred)", () => {
        const f = meta().fields.find((x) => x.name === "dealId")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("every property field is OPTIONAL (runtime enforces 'at least one property')", () => {
        const optionals = meta().fields.filter((f) => f.name !== "dealId");
        for (const f of optionals) {
          expect(f.required).toBe(false);
        }
      });

      it("preserves pipeline→dealstage cascade (pipeline before dealstage; dealstage.dependsOn=pipeline)", () => {
        const names = meta().fields.map((f) => f.name);
        expect(names.indexOf("pipeline")).toBeLessThan(names.indexOf("dealstage"));
        const stage = meta().fields.find((x) => x.name === "dealstage")!;
        expect(stage.optionsSource).toBe("hubspot:deal_stages");
        expect(stage.dependsOn).toBe("pipeline");
      });

      it("hubspot_owner_id is an optional combobox sourced from hubspot:owners", () => {
        const f = meta().fields.find((x) => x.name === "hubspot_owner_id")!;
        expect(f.type).toBe("combobox");
        expect(f.optionsSource).toBe("hubspot:owners");
      });

      it("outputs mark dealname + amount + properties sensitive", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("dealname")!.sensitive).toBe(true);
        expect(byName.get("amount")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
      });
    });

    describe("get_deals field surface (Slice 3.HUBSPOT-4)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:get_deals",
        )!;
      }

      it("exposes limit / after / properties / filterProperty / filterValue (mirrors get_contacts shape)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "limit",
          "after",
          "properties",
          "filterProperty",
          "filterValue",
        ]);
      });

      it("limit is a bounded number (1..100, integer — matches schema cap)", () => {
        const f = meta().fields.find((x) => x.name === "limit")!;
        expect(f.type).toBe("number");
        expect(f.numeric?.min).toBe(1);
        expect(f.numeric?.max).toBe(100);
        expect(f.numeric?.integer).toBe(true);
      });

      it("properties is an optional string-array (matches schema's string|string[] union)", () => {
        const f = meta().fields.find((x) => x.name === "properties")!;
        expect(f.type).toBe("string-array");
      });

      it("deals output is sensitive; count/total/nextCursor/hasMore stay structural", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("deals")!.sensitive).toBe(true);
        expect(byName.get("count")!.sensitive).toBeFalsy();
        expect(byName.get("total")!.sensitive).toBeFalsy();
        expect(byName.get("nextCursor")!.sensitive).toBeFalsy();
        expect(byName.get("hasMore")!.sensitive).toBeFalsy();
      });
    });

    describe("create_ticket field surface (Slice 3.HUBSPOT-4)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_ticket",
        )!;
      }

      it("exposes the schema's 11 fields ordered for the pipeline→stage cascade UX", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "subject",
          "hs_pipeline",
          "hs_pipeline_stage",
          "content",
          "hs_ticket_priority",
          "hs_ticket_category",
          "source_type",
          "hubspot_owner_id",
          "associatedContactId",
          "associatedCompanyId",
          "associatedDealId",
        ]);
      });

      it("subject is required text", () => {
        const f = meta().fields.find((x) => x.name === "subject")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("hs_pipeline is a required combobox sourced from hubspot:ticket_pipelines", () => {
        const f = meta().fields.find((x) => x.name === "hs_pipeline")!;
        expect(f.type).toBe("combobox");
        expect(f.required).toBe(true);
        expect(f.optionsSource).toBe("hubspot:ticket_pipelines");
      });

      it("hs_pipeline_stage is a required combobox sourced from hubspot:ticket_stages with dependsOn: hs_pipeline (matches resolver's requiredDeps)", () => {
        const f = meta().fields.find((x) => x.name === "hs_pipeline_stage")!;
        expect(f.type).toBe("combobox");
        expect(f.required).toBe(true);
        expect(f.optionsSource).toBe("hubspot:ticket_stages");
        expect(f.dependsOn).toBe("hs_pipeline");
      });

      it("content is textarea (ticket body)", () => {
        const f = meta().fields.find((x) => x.name === "content")!;
        expect(f.type).toBe("textarea");
      });

      it("hs_ticket_priority is a select with exact LOW/MEDIUM/HIGH enum options + NO defaultValue per Q11", () => {
        const f = meta().fields.find((x) => x.name === "hs_ticket_priority")!;
        expect(f.type).toBe("select");
        expect(f.required).toBe(false);
        expect(f.defaultValue).toBeUndefined();
        expect(f.options!.map((o) => o.value)).toEqual([
          "LOW",
          "MEDIUM",
          "HIGH",
        ]);
      });

      it("hubspot_owner_id is an optional combobox sourced from hubspot:owners", () => {
        const f = meta().fields.find((x) => x.name === "hubspot_owner_id")!;
        expect(f.type).toBe("combobox");
        expect(f.optionsSource).toBe("hubspot:owners");
      });

      it("association fields are optional text (search-by-property pickers deferred)", () => {
        for (const name of [
          "associatedContactId",
          "associatedCompanyId",
          "associatedDealId",
        ]) {
          const f = meta().fields.find((x) => x.name === name)!;
          expect(f.type).toBe("text");
          expect(f.required).toBe(false);
        }
      });

      it("outputs are {ticketId, subject, pipeline, pipelineStage, createdAt, updatedAt, properties, associationsAttached, associationWarnings} — subject + properties sensitive", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual([
          "ticketId",
          "subject",
          "pipeline",
          "pipelineStage",
          "createdAt",
          "updatedAt",
          "properties",
          "associationsAttached",
          "associationWarnings",
        ]);
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("subject")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
        // Structural / association-report fields stay non-sensitive
        // (warnings carry hubspot ids + provider error strings, not
        // customer PII).
        expect(byName.get("ticketId")!.sensitive).toBeFalsy();
        expect(byName.get("pipeline")!.sensitive).toBeFalsy();
        expect(byName.get("pipelineStage")!.sensitive).toBeFalsy();
        expect(byName.get("associationsAttached")!.sensitive).toBeFalsy();
        expect(byName.get("associationWarnings")!.sensitive).toBeFalsy();
      });
    });

    describe("update_ticket field surface (Slice 3.HUBSPOT-4)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:update_ticket",
        )!;
      }

      it("ticketId is required text", () => {
        const f = meta().fields.find((x) => x.name === "ticketId")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("every property field is OPTIONAL (runtime enforces 'at least one property')", () => {
        const optionals = meta().fields.filter((f) => f.name !== "ticketId");
        for (const f of optionals) {
          expect(f.required).toBe(false);
        }
      });

      it("preserves hs_pipeline→hs_pipeline_stage cascade (parent before child; child.dependsOn=hs_pipeline)", () => {
        const names = meta().fields.map((f) => f.name);
        expect(names.indexOf("hs_pipeline")).toBeLessThan(
          names.indexOf("hs_pipeline_stage"),
        );
        const stage = meta().fields.find((x) => x.name === "hs_pipeline_stage")!;
        expect(stage.optionsSource).toBe("hubspot:ticket_stages");
        expect(stage.dependsOn).toBe("hs_pipeline");
      });

      it("hs_ticket_priority is a select with exact LOW/MEDIUM/HIGH enum options + NO defaultValue", () => {
        const f = meta().fields.find((x) => x.name === "hs_ticket_priority")!;
        expect(f.type).toBe("select");
        expect(f.defaultValue).toBeUndefined();
        expect(f.options!.map((o) => o.value)).toEqual([
          "LOW",
          "MEDIUM",
          "HIGH",
        ]);
      });

      it("does NOT include association fields (V1 + V2 don't ship association handling on update)", () => {
        const names = new Set(meta().fields.map((f) => f.name));
        expect(names.has("associatedContactId")).toBe(false);
        expect(names.has("associatedCompanyId")).toBe(false);
        expect(names.has("associatedDealId")).toBe(false);
      });

      it("outputs mark subject + properties sensitive", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("subject")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
      });
    });

    describe("get_tickets field surface (Slice 3.HUBSPOT-4)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:get_tickets",
        )!;
      }

      it("mirrors get_deals shape (limit / after / properties / filterProperty / filterValue)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "limit",
          "after",
          "properties",
          "filterProperty",
          "filterValue",
        ]);
      });

      it("tickets output is sensitive; pagination scalars stay structural", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("tickets")!.sensitive).toBe(true);
        expect(byName.get("count")!.sensitive).toBeFalsy();
        expect(byName.get("hasMore")!.sensitive).toBeFalsy();
      });
    });

    describe("get_owners field surface (Slice 3.HUBSPOT-4)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:get_owners",
        )!;
      }

      it("exposes limit / email / after (matches schema)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "limit",
          "email",
          "after",
        ]);
      });

      it("limit is a bounded number (1..100, integer)", () => {
        const f = meta().fields.find((x) => x.name === "limit")!;
        expect(f.type).toBe("number");
        expect(f.numeric?.min).toBe(1);
        expect(f.numeric?.max).toBe(100);
        expect(f.numeric?.integer).toBe(true);
      });

      it("email is optional text (schema z.string().email(); UI keeps text per the slice rule)", () => {
        const f = meta().fields.find((x) => x.name === "email")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(false);
      });

      it("owners array output is sensitive (per-entry email + names = employee PII); count/cursor/hasMore stay structural", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("owners")!.sensitive).toBe(true);
        expect(byName.get("count")!.sensitive).toBeFalsy();
        expect(byName.get("nextCursor")!.sensitive).toBeFalsy();
        expect(byName.get("hasMore")!.sensitive).toBeFalsy();
      });

      it("get_owners is low-risk (pure read)", () => {
        expect(meta().riskLevel).toBe("low");
        expect(meta().isDestructive).toBe(false);
        expect(meta().requiresConfirmation).toBe(false);
      });
    });

    // ─── HUBSPOT-5 engagement + list + commerce surface ────────────────────

    describe("create_note field surface (Slice 3.HUBSPOT-5)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_note",
        )!;
      }

      it("exposes the schema's 7 fields (body + timestamp + owner + 4 associations)", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "hs_note_body",
          "hs_timestamp",
          "hubspot_owner_id",
          "associatedContactId",
          "associatedCompanyId",
          "associatedDealId",
          "associatedTicketId",
        ]);
      });

      it("hs_note_body is required textarea", () => {
        const f = meta().fields.find((x) => x.name === "hs_note_body")!;
        expect(f.type).toBe("textarea");
        expect(f.required).toBe(true);
      });

      it("hubspot_owner_id is combobox sourced from hubspot:owners", () => {
        const f = meta().fields.find((x) => x.name === "hubspot_owner_id")!;
        expect(f.type).toBe("combobox");
        expect(f.optionsSource).toBe("hubspot:owners");
      });

      it("outputs are {noteId, body, timestamp, createdAt, properties, associationsAttached, associationWarnings} — body + properties sensitive", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toEqual([
          "noteId",
          "body",
          "timestamp",
          "createdAt",
          "properties",
          "associationsAttached",
          "associationWarnings",
        ]);
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        // `body` is in SUSPICIOUS_NAMES — sensitive flag is the
        // load-bearing guard against the structural test.
        expect(byName.get("body")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
        expect(byName.get("noteId")!.sensitive).toBeFalsy();
        expect(byName.get("timestamp")!.sensitive).toBeFalsy();
        expect(byName.get("createdAt")!.sensitive).toBeFalsy();
        expect(byName.get("associationsAttached")!.sensitive).toBeFalsy();
        expect(byName.get("associationWarnings")!.sensitive).toBeFalsy();
      });
    });

    describe("create_task field surface (Slice 3.HUBSPOT-5)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_task",
        )!;
      }

      it("exposes the schema's 12 fields in schema order", () => {
        expect(meta().fields.map((f) => f.name)).toEqual([
          "hs_task_subject",
          "hs_task_body",
          "hs_task_status",
          "hs_task_priority",
          "hs_task_type",
          "hs_timestamp",
          "hs_task_reminders",
          "hubspot_owner_id",
          "associatedContactId",
          "associatedCompanyId",
          "associatedDealId",
          "associatedTicketId",
        ]);
      });

      it("hs_task_subject is required text", () => {
        const f = meta().fields.find((x) => x.name === "hs_task_subject")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("hs_task_status / priority / type select fields mirror the schema's Zod defaults (NOT_STARTED / MEDIUM / TODO)", () => {
        const status = meta().fields.find((x) => x.name === "hs_task_status")!;
        expect(status.type).toBe("select");
        expect(status.defaultValue).toBe("NOT_STARTED");
        expect(status.options!.map((o) => o.value)).toEqual([
          "NOT_STARTED",
          "IN_PROGRESS",
          "COMPLETED",
          "WAITING",
          "DEFERRED",
        ]);
        const priority = meta().fields.find((x) => x.name === "hs_task_priority")!;
        expect(priority.type).toBe("select");
        expect(priority.defaultValue).toBe("MEDIUM");
        expect(priority.options!.map((o) => o.value)).toEqual([
          "LOW",
          "MEDIUM",
          "HIGH",
        ]);
        const type = meta().fields.find((x) => x.name === "hs_task_type")!;
        expect(type.type).toBe("select");
        expect(type.defaultValue).toBe("TODO");
        expect(type.options!.map((o) => o.value)).toEqual([
          "TODO",
          "CALL",
          "EMAIL",
        ]);
      });

      it("hubspot_owner_id is combobox sourced from hubspot:owners", () => {
        const f = meta().fields.find((x) => x.name === "hubspot_owner_id")!;
        expect(f.type).toBe("combobox");
        expect(f.optionsSource).toBe("hubspot:owners");
      });

      it("outputs mark subject + properties sensitive; structural fields stay non-sensitive", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("subject")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
        expect(byName.get("taskId")!.sensitive).toBeFalsy();
        expect(byName.get("status")!.sensitive).toBeFalsy();
        expect(byName.get("priority")!.sensitive).toBeFalsy();
        expect(byName.get("type")!.sensitive).toBeFalsy();
      });
    });

    describe("create_call field surface (Slice 3.HUBSPOT-5)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_call",
        )!;
      }

      it("hs_call_direction is a select with INBOUND/OUTBOUND options and NO defaultValue", () => {
        const f = meta().fields.find((x) => x.name === "hs_call_direction")!;
        expect(f.type).toBe("select");
        expect(f.defaultValue).toBeUndefined();
        expect(f.options!.map((o) => o.value)).toEqual(["INBOUND", "OUTBOUND"]);
      });

      it("hs_call_status defaults to COMPLETED (matches schema's Zod default) with all 9 status enum values", () => {
        const f = meta().fields.find((x) => x.name === "hs_call_status")!;
        expect(f.type).toBe("select");
        expect(f.defaultValue).toBe("COMPLETED");
        expect(f.options!.map((o) => o.value)).toEqual([
          "BUSY",
          "CANCELED",
          "COMPLETED",
          "CONNECTING",
          "FAILED",
          "IN_PROGRESS",
          "NO_ANSWER",
          "QUEUED",
          "RINGING",
        ]);
      });

      it("hs_call_duration is TEXT (numeric string for ms)", () => {
        const f = meta().fields.find((x) => x.name === "hs_call_duration")!;
        expect(f.type).toBe("text");
      });

      it("outputs mark title + properties sensitive", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("title")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
        expect(byName.get("callId")!.sensitive).toBeFalsy();
      });
    });

    describe("create_meeting field surface (Slice 3.HUBSPOT-5)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_meeting",
        )!;
      }

      it("hs_meeting_title is required text", () => {
        const f = meta().fields.find((x) => x.name === "hs_meeting_title")!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("hs_meeting_outcome defaults to SCHEDULED with the schema's 5 enum values", () => {
        const f = meta().fields.find((x) => x.name === "hs_meeting_outcome")!;
        expect(f.type).toBe("select");
        expect(f.defaultValue).toBe("SCHEDULED");
        expect(f.options!.map((o) => o.value)).toEqual([
          "SCHEDULED",
          "COMPLETED",
          "RESCHEDULED",
          "NO_SHOW",
          "CANCELED",
        ]);
      });

      it("outputs mark title + location + properties sensitive (location can carry access-bearing video-conf URLs)", () => {
        const byName = new Map(meta().outputs.map((o) => [o.name, o]));
        expect(byName.get("title")!.sensitive).toBe(true);
        expect(byName.get("location")!.sensitive).toBe(true);
        expect(byName.get("properties")!.sensitive).toBe(true);
        expect(byName.get("outcome")!.sensitive).toBeFalsy();
        expect(byName.get("startTime")!.sensitive).toBeFalsy();
        expect(byName.get("endTime")!.sensitive).toBeFalsy();
      });
    });

    describe("add_contact_to_list / remove_from_list field surface (Slice 3.HUBSPOT-5)", () => {
      function addMeta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:add_contact_to_list",
        )!;
      }
      function removeMeta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:remove_from_list",
        )!;
      }

      it("both expose the schema's 2 required fields (listId + email)", () => {
        for (const meta of [addMeta(), removeMeta()]) {
          expect(meta.fields.map((f) => f.name)).toEqual(["listId", "email"]);
          const listId = meta.fields.find((x) => x.name === "listId")!;
          expect(listId.type).toBe("combobox");
          expect(listId.required).toBe(true);
          expect(listId.optionsSource).toBe("hubspot:lists");
          const email = meta.fields.find((x) => x.name === "email")!;
          expect(email.type).toBe("text");
          expect(email.required).toBe(true);
        }
      });

      it("add_contact_to_list outputs are {listId, email, contactIdsAdded, contactIdsDiscarded} — email + both id arrays sensitive", () => {
        const meta = addMeta();
        expect(meta.outputs.map((o) => o.name)).toEqual([
          "listId",
          "email",
          "contactIdsAdded",
          "contactIdsDiscarded",
        ]);
        const byName = new Map(meta.outputs.map((o) => [o.name, o]));
        // `email` is in SUSPICIOUS_NAMES — load-bearing sensitive flag.
        expect(byName.get("email")!.sensitive).toBe(true);
        expect(byName.get("contactIdsAdded")!.sensitive).toBe(true);
        expect(byName.get("contactIdsDiscarded")!.sensitive).toBe(true);
        expect(byName.get("listId")!.sensitive).toBeFalsy();
      });

      it("remove_from_list outputs use contactIdsRemoved (NOT contactIdsAdded — symmetric to add)", () => {
        const meta = removeMeta();
        expect(meta.outputs.map((o) => o.name)).toEqual([
          "listId",
          "email",
          "contactIdsRemoved",
          "contactIdsDiscarded",
        ]);
        const byName = new Map(meta.outputs.map((o) => [o.name, o]));
        expect(byName.get("email")!.sensitive).toBe(true);
        expect(byName.get("contactIdsRemoved")!.sensitive).toBe(true);
        expect(byName.get("contactIdsDiscarded")!.sensitive).toBe(true);
      });
    });

    describe("create_product / update_product / get_products field surface (Slice 3.HUBSPOT-5)", () => {
      function createMeta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_product",
        )!;
      }
      function updateMeta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:update_product",
        )!;
      }
      function getMeta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:get_products",
        )!;
      }

      it("create_product exposes the schema's 6 fields with name required + numeric-string price/cost", () => {
        expect(createMeta().fields.map((f) => f.name)).toEqual([
          "name",
          "description",
          "price",
          "hs_sku",
          "hs_cost_of_goods_sold",
          "hs_recurring_billing_period",
        ]);
        const byName = new Map(createMeta().fields.map((f) => [f.name, f]));
        expect(byName.get("name")!.required).toBe(true);
        for (const fname of ["price", "hs_cost_of_goods_sold"]) {
          const f = byName.get(fname)!;
          expect(f.type).toBe("text");
          expect(f.description!.toLowerCase()).toContain("string");
        }
      });

      it("update_product.productId is required text; every property field is OPTIONAL", () => {
        const m = updateMeta();
        const id = m.fields.find((x) => x.name === "productId")!;
        expect(id.type).toBe("text");
        expect(id.required).toBe(true);
        for (const f of m.fields.filter((x) => x.name !== "productId")) {
          expect(f.required).toBe(false);
        }
      });

      it("get_products mirrors get_deals shape; products array sensitive", () => {
        expect(getMeta().fields.map((f) => f.name)).toEqual([
          "limit",
          "after",
          "properties",
          "filterProperty",
          "filterValue",
        ]);
        const byName = new Map(getMeta().outputs.map((o) => [o.name, o]));
        expect(byName.get("products")!.sensitive).toBe(true);
        expect(byName.get("count")!.sensitive).toBeFalsy();
        expect(byName.get("hasMore")!.sensitive).toBeFalsy();
      });

      it("product outputs mark name + price + properties sensitive; sku stays non-sensitive (public catalog identifier)", () => {
        for (const m of [createMeta(), updateMeta()]) {
          const byName = new Map(m.outputs.map((o) => [o.name, o]));
          expect(byName.get("name")!.sensitive).toBe(true);
          expect(byName.get("price")!.sensitive).toBe(true);
          expect(byName.get("properties")!.sensitive).toBe(true);
          expect(byName.get("sku")!.sensitive).toBeFalsy();
        }
      });
    });

    describe("create_line_item / update_line_item / get_line_items field surface (Slice 3.HUBSPOT-5)", () => {
      function createMeta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:create_line_item",
        )!;
      }
      function updateMeta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:update_line_item",
        )!;
      }
      function getMeta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:get_line_items",
        )!;
      }

      it("create_line_item exposes the schema's 6 fields; dealId + quantity required at the schema layer", () => {
        expect(createMeta().fields.map((f) => f.name)).toEqual([
          "dealId",
          "hs_product_id",
          "name",
          "quantity",
          "price",
          "discount",
        ]);
        const byName = new Map(createMeta().fields.map((f) => [f.name, f]));
        expect(byName.get("dealId")!.required).toBe(true);
        expect(byName.get("quantity")!.required).toBe(true);
        // The handler also enforces "at least one of hs_product_id /
        // name" — meta keeps both optional so authors can pick either.
        expect(byName.get("hs_product_id")!.required).toBe(false);
        expect(byName.get("name")!.required).toBe(false);
      });

      it("numeric-string fields (quantity, price, discount) are TEXT, not number", () => {
        for (const fname of ["quantity", "price", "discount"]) {
          const f = createMeta().fields.find((x) => x.name === fname)!;
          expect(f.type).toBe("text");
        }
      });

      it("update_line_item.lineItemId is required text; every property field is OPTIONAL", () => {
        const m = updateMeta();
        const id = m.fields.find((x) => x.name === "lineItemId")!;
        expect(id.type).toBe("text");
        expect(id.required).toBe(true);
        for (const f of m.fields.filter((x) => x.name !== "lineItemId")) {
          expect(f.required).toBe(false);
        }
      });

      it("get_line_items mirrors get_deals shape; lineItems array sensitive", () => {
        expect(getMeta().fields.map((f) => f.name)).toEqual([
          "limit",
          "after",
          "properties",
          "filterProperty",
          "filterValue",
        ]);
        const byName = new Map(getMeta().outputs.map((o) => [o.name, o]));
        expect(byName.get("lineItems")!.sensitive).toBe(true);
      });

      it("line item outputs mark name + quantity + price + discount + amount + properties sensitive (commerce + financial detail)", () => {
        for (const m of [createMeta(), updateMeta()]) {
          const byName = new Map(m.outputs.map((o) => [o.name, o]));
          expect(byName.get("name")!.sensitive).toBe(true);
          expect(byName.get("quantity")!.sensitive).toBe(true);
          expect(byName.get("price")!.sensitive).toBe(true);
          expect(byName.get("discount")!.sensitive).toBe(true);
          expect(byName.get("amount")!.sensitive).toBe(true);
          expect(byName.get("properties")!.sensitive).toBe(true);
        }
      });
    });

    describe("remove_line_item — the sole HubSpot destructive action (Slice 3.HUBSPOT-5)", () => {
      function meta() {
        return hubspotActionMetas().find(
          (m) => m.key === "hubspot:remove_line_item",
        )!;
      }

      it("declares the full destructive trio: isDestructive=true, requiresConfirmation=true, riskLevel=high, with riskDescription", () => {
        const m = meta();
        expect(m.isDestructive).toBe(true);
        expect(m.requiresConfirmation).toBe(true);
        expect(m.riskLevel).toBe("high");
        expect(m.riskDescription).toBeDefined();
        expect(m.riskDescription!.length).toBeGreaterThan(0);
      });

      it("exposes a single required lineItemId text field — no other config", () => {
        expect(meta().fields.map((f) => f.name)).toEqual(["lineItemId"]);
        const f = meta().fields[0]!;
        expect(f.type).toBe("text");
        expect(f.required).toBe(true);
      });

      it("outputs are the narrow {lineItemId, deleted} pair — neither sensitive (DELETE returns 204, nothing to surface)", () => {
        expect(meta().outputs.map((o) => o.name)).toEqual([
          "lineItemId",
          "deleted",
        ]);
        for (const o of meta().outputs) {
          expect(o.sensitive).toBeFalsy();
        }
      });
    });
  });

  // ─── HubSpot trigger surface (Slice 3.HUBSPOT-6) ─────────────────────────
  //
  // Single consolidated `webhook_received` trigger meta closes the
  // HubSpot provider arc at 26 actions + 1 trigger and flips hubspot
  // into COVERED_PROVIDERS.
  describe("HubSpot trigger surface (Slice 3.HUBSPOT-6)", () => {
    function hubspotTriggerMetas() {
      return listTriggerMetasForProvider("hubspot");
    }

    it("registers exactly 1 trigger meta — the consolidated hubspot:webhook_received", () => {
      const metas = hubspotTriggerMetas();
      expect(metas).toHaveLength(1);
      expect(metas[0]!.key).toBe("hubspot:webhook_received");
    });

    it("trigger meta declares provider=hubspot, category=crm, activation=webhook, requiresIntegration=true", () => {
      const meta = hubspotTriggerMetas()[0]!;
      expect(meta.provider).toBe("hubspot");
      expect(meta.type).toBe("webhook_received");
      expect(meta.category).toBe("crm");
      expect(meta.activation).toBe("webhook");
      expect(meta.requiresIntegration).toBe(true);
    });

    it("exposes a single required `subscriptions` object-list matching the parseSubscriptions shape (CONFIG-UX-AUDIT-1)", () => {
      const meta = hubspotTriggerMetas()[0]!;
      expect(meta.fields.map((f) => f.name)).toEqual(["subscriptions"]);
      const f = meta.fields[0]!;
      expect(f.type).toBe("object-list");
      expect(f.required).toBe(true);
      // Row shape: eventType select over the activation allowlist +
      // propertyName gated to *.propertyChange rows.
      expect(f.itemFields!.map((s) => s.name)).toEqual([
        "eventType",
        "propertyName",
      ]);
      const eventType = f.itemFields![0]!;
      expect(eventType.type).toBe("select");
      expect(eventType.options!.map((o) => o.value)).toEqual([
        ...HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES,
      ]);
      const propertyName = f.itemFields![1]!;
      expect(propertyName.visibleWhen).toEqual({
        field: "eventType",
        valueEndsWith: ".propertyChange",
      });
    });

    it("payloadShape mirrors normalize.ts:normalizeHubSpotEvent — exact field set in declared order", () => {
      const meta = hubspotTriggerMetas()[0]!;
      expect(meta.payloadShape.map((o) => o.name)).toEqual([
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
    });

    it("propertyValue + raw event payload are sensitive; discriminator scalars + opaque IDs stay structural", () => {
      const meta = hubspotTriggerMetas()[0]!;
      const byName = new Map(meta.payloadShape.map((o) => [o.name, o]));
      // Customer-data carriers — sensitive.
      expect(byName.get("propertyValue")!.sensitive).toBe(true);
      expect(byName.get("event")!.sensitive).toBe(true);
      // Discriminators + opaque IDs + retry-state — non-sensitive.
      expect(byName.get("subscriptionType")!.sensitive).toBeFalsy();
      expect(byName.get("portalId")!.sensitive).toBeFalsy();
      expect(byName.get("hubId")!.sensitive).toBeFalsy();
      expect(byName.get("objectId")!.sensitive).toBeFalsy();
      expect(byName.get("propertyName")!.sensitive).toBeFalsy();
      expect(byName.get("occurredAt")!.sensitive).toBeFalsy();
      expect(byName.get("subscriptionId")!.sensitive).toBeFalsy();
      expect(byName.get("appId")!.sensitive).toBeFalsy();
      expect(byName.get("attemptNumber")!.sensitive).toBeFalsy();
      expect(byName.get("changeSource")!.sensitive).toBeFalsy();
    });

    it("no HubSpot trigger payload field uses a banned secret name (defense in depth)", () => {
      const banned = new Set([
        "token",
        "accessToken",
        "refreshToken",
        "clientSecret",
        "secret",
        "apiKey",
        "webhookSecret",
      ]);
      const meta = hubspotTriggerMetas()[0]!;
      for (const o of meta.payloadShape) {
        expect(banned.has(o.name)).toBe(false);
      }
    });
  });

  // Mailchimp (Slice 3.MAILCHIMP-3) — 12 of 14 non-campaign-read
  // actions. The 2 `get_campaign*` metas + 7 trigger metas land in
  // MAILCHIMP-4, which also flips Mailchimp into COVERED_PROVIDERS.
  describe("Mailchimp action surface (Slice 3.MAILCHIMP-3)", () => {
    function mailchimp(): ReadonlyArray<ActionMeta> {
      return listActionMetasForProvider("mailchimp");
    }

    it("listActionMetasForProvider('mailchimp') returns the 14 Mailchimp actions in displayOrder (12 MAILCHIMP-3 + 2 MAILCHIMP-4 campaign reads)", () => {
      const metas = mailchimp();
      expect(metas).toHaveLength(14);
      expect(metas.map((m) => m.key)).toEqual([
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
    });

    it("every Mailchimp action meta declares provider='mailchimp', category='marketing', requiresIntegration=true, and no file refs", () => {
      for (const m of mailchimp()) {
        expect(m.provider).toBe("mailchimp");
        expect(m.category).toBe("marketing");
        expect(m.requiresIntegration).toBe(true);
        expect(m.producesFileRef).toBe(false);
        expect(m.consumesFileRef).toBe(false);
      }
    });

    it("mailchimp:remove_subscriber declares the FULL destructive trio (high + isDestructive + requiresConfirmation) with a riskDescription", () => {
      const m = mailchimp().find((x) => x.key === "mailchimp:remove_subscriber")!;
      expect(m.riskLevel).toBe("high");
      expect(m.isDestructive).toBe(true);
      expect(m.requiresConfirmation).toBe(true);
      expect(m.riskDescription).toBeDefined();
      expect(m.riskDescription!.length).toBeGreaterThan(0);
      // riskDescription must call out the irreversibility / re-subscribe
      // block so reviewers see WHY the destructive trio is justified.
      expect(m.riskDescription!.toLowerCase()).toContain("re-subscribe");
    });

    it("mailchimp:unsubscribe_subscriber is high + requiresConfirmation BUT NOT destructive (consent change only — record retained)", () => {
      const m = mailchimp().find(
        (x) => x.key === "mailchimp:unsubscribe_subscriber",
      )!;
      expect(m.riskLevel).toBe("high");
      expect(m.requiresConfirmation).toBe(true);
      expect(m.isDestructive).toBe(false);
      expect(m.riskDescription).toBeDefined();
      expect(m.riskDescription!.length).toBeGreaterThan(0);
    });

    it("medium-risk Mailchimp actions are isDestructive:false + requiresConfirmation:false + riskLevel:'medium' with riskDescription", () => {
      const MEDIUM_KEYS = [
        "mailchimp:add_subscriber",
        "mailchimp:update_subscriber",
        "mailchimp:add_tag",
        "mailchimp:remove_tag",
        "mailchimp:create_audience",
        "mailchimp:create_segment",
        "mailchimp:create_custom_event",
      ] as const;
      for (const key of MEDIUM_KEYS) {
        const m = mailchimp().find((x) => x.key === key);
        expect(m).toBeDefined();
        expect(m!.riskLevel).toBe("medium");
        expect(m!.isDestructive).toBe(false);
        expect(m!.requiresConfirmation).toBe(false);
        expect(m!.riskDescription).toBeDefined();
        expect(m!.riskDescription!.length).toBeGreaterThan(0);
      }
    });

    it("low-risk Mailchimp actions are reads + the internal note annotation", () => {
      const LOW_KEYS = [
        "mailchimp:get_subscriber",
        "mailchimp:get_subscribers",
        "mailchimp:add_note",
      ] as const;
      for (const key of LOW_KEYS) {
        const m = mailchimp().find((x) => x.key === key);
        expect(m).toBeDefined();
        expect(m!.riskLevel).toBe("low");
        expect(m!.isDestructive).toBe(false);
        expect(m!.requiresConfirmation).toBe(false);
      }
    });

    it("audience-scoped action fields preserve EXACT runtime names (audience_id for 10 actions, listId for the V1-named pair)", () => {
      const byKey = new Map(mailchimp().map((m) => [m.key, m]));
      const AUDIENCE_ID_KEYS = [
        "mailchimp:add_subscriber",
        "mailchimp:update_subscriber",
        "mailchimp:get_subscriber",
        "mailchimp:add_tag",
        "mailchimp:remove_tag",
        "mailchimp:create_segment",
        "mailchimp:create_custom_event",
        "mailchimp:add_note",
        "mailchimp:remove_subscriber",
      ] as const;
      for (const key of AUDIENCE_ID_KEYS) {
        const fields = byKey.get(key)!.fields;
        const audience = fields.find((f) => f.name === "audience_id");
        expect(audience).toBeDefined();
        expect(audience!.type).toBe("combobox");
        expect(audience!.optionsSource).toBe("mailchimp:audiences");
        expect(audience!.required).toBe(true);
        // None of these actions consume mailchimp:segments yet.
        expect(fields.some((f) => f.optionsSource === "mailchimp:segments")).toBe(
          false,
        );
      }

      // listId pair — preserved verbatim from the V1-derived schemas.
      for (const key of [
        "mailchimp:get_subscribers",
        "mailchimp:unsubscribe_subscriber",
      ] as const) {
        const fields = byKey.get(key)!.fields;
        const listId = fields.find((f) => f.name === "listId");
        expect(listId).toBeDefined();
        expect(listId!.type).toBe("combobox");
        expect(listId!.optionsSource).toBe("mailchimp:audiences");
        expect(listId!.required).toBe(true);
        // unsubscribe uses `emailAddress` not `email`; verify the
        // runtime-name preservation is visible in the meta.
        if (key === "mailchimp:unsubscribe_subscriber") {
          expect(fields.find((f) => f.name === "emailAddress")).toBeDefined();
          expect(fields.find((f) => f.name === "email")).toBeUndefined();
        }
      }
    });

    it("mailchimp:add_subscriber pins the Q11 consent gate — status is REQUIRED with NO defaultValue and 5 enum options", () => {
      const m = mailchimp().find((x) => x.key === "mailchimp:add_subscriber")!;
      const status = m.fields.find((f) => f.name === "status")!;
      expect(status.type).toBe("select");
      expect(status.required).toBe(true);
      expect(status.defaultValue).toBeUndefined();
      const values = status.options!.map((o) => o.value).sort();
      expect(values).toEqual([
        "cleaned",
        "pending",
        "subscribed",
        "transactional",
        "unsubscribed",
      ]);
      // tags stays text (CSV) per V1 input shape — string-array is a
      // future UI slice. Pin so a flip to string-array breaks visibly.
      const tags = m.fields.find((f) => f.name === "tags")!;
      expect(tags.type).toBe("text");
      expect(tags.required).toBe(false);
    });

    it("mailchimp:remove_subscriber pins mode as REQUIRED select with NO default and BOTH options (archive + delete_permanent)", () => {
      const m = mailchimp().find(
        (x) => x.key === "mailchimp:remove_subscriber",
      )!;
      const mode = m.fields.find((f) => f.name === "mode")!;
      expect(mode.type).toBe("select");
      expect(mode.required).toBe(true);
      expect(mode.defaultValue).toBeUndefined();
      expect(mode.options!.map((o) => o.value).sort()).toEqual([
        "archive",
        "delete_permanent",
      ]);
    });

    it("mailchimp:add_tag + remove_tag use string-array for `tags` (NOT CSV — the schema is z.array(z.string()))", () => {
      for (const key of ["mailchimp:add_tag", "mailchimp:remove_tag"] as const) {
        const m = mailchimp().find((x) => x.key === key)!;
        const tags = m.fields.find((f) => f.name === "tags")!;
        expect(tags.type).toBe("string-array");
        expect(tags.required).toBe(true);
      }
    });

    it("mailchimp:create_custom_event.properties is keyvalue (Record<string,string>)", () => {
      const m = mailchimp().find(
        (x) => x.key === "mailchimp:create_custom_event",
      )!;
      const properties = m.fields.find((f) => f.name === "properties")!;
      expect(properties.type).toBe("keyvalue");
      expect(properties.required).toBe(false);
    });

    it("mailchimp:create_segment pins the discriminated-union shape — mode required with NO default + both options + structured conditions/emails editors (CONFIG-UX-AUDIT-1)", () => {
      const m = mailchimp().find((x) => x.key === "mailchimp:create_segment")!;
      const mode = m.fields.find((f) => f.name === "mode")!;
      expect(mode.type).toBe("select");
      expect(mode.required).toBe(true);
      expect(mode.defaultValue).toBeUndefined();
      expect(mode.options!.map((o) => o.value).sort()).toEqual([
        "saved",
        "static",
      ]);
      const conditions = m.fields.find((f) => f.name === "conditions")!;
      expect(conditions.type).toBe("object-list");
      expect(conditions.itemFields!.map((s) => s.name)).toEqual([
        "field",
        "op",
        "value",
      ]);
      expect(conditions.required).toBe(false); // cross-field required at runtime
      const staticEmails = m.fields.find((f) => f.name === "static_emails")!;
      expect(staticEmails.type).toBe("string-array");
      expect(staticEmails.required).toBe(false);
    });

    it("mailchimp:create_audience pins the compliance fields as required + nested objects as advanced JSON textareas", () => {
      const m = mailchimp().find((x) => x.key === "mailchimp:create_audience")!;
      const byName = new Map(m.fields.map((f) => [f.name, f]));
      expect(byName.get("name")!.required).toBe(true);
      expect(byName.get("permission_reminder")!.required).toBe(true);
      expect(byName.get("permission_reminder")!.type).toBe("textarea");
      const emailTypeOption = byName.get("email_type_option")!;
      expect(emailTypeOption.type).toBe("boolean");
      expect(emailTypeOption.required).toBe(true);
      // Nested objects stay JSON textareas until a dedicated nested-form UI
      // lands — marked advanced so the disclosure (auto-open for required
      // fields) hosts them and JSON copy stays off the normal path.
      expect(byName.get("contact")!.type).toBe("textarea");
      expect(byName.get("contact")!.required).toBe(true);
      expect(byName.get("contact")!.advanced).toBe(true);
      expect(byName.get("campaign_defaults")!.type).toBe("textarea");
      expect(byName.get("campaign_defaults")!.required).toBe(true);
      expect(byName.get("campaign_defaults")!.advanced).toBe(true);
    });

    it("PII-bearing Mailchimp outputs are marked sensitive", () => {
      const byKey = new Map(mailchimp().map((m) => [m.key, m]));

      // `email` outputs (suspicious-name structural guard would catch
      // these anyway — pinned here for documentation).
      for (const key of [
        "mailchimp:add_subscriber",
        "mailchimp:update_subscriber",
        "mailchimp:get_subscriber",
        "mailchimp:add_tag",
        "mailchimp:remove_tag",
        "mailchimp:remove_subscriber",
        "mailchimp:add_note",
      ] as const) {
        const m = byKey.get(key)!;
        const email = m.outputs.find((o) => o.name === "email")!;
        expect(email.sensitive).toBe(true);
      }

      // emailAddress / subscriberEmail / subscribers / note / tags /
      // mergeFields / segment name / audience name — NOT in the
      // suspicious-name set, but per the accepted plan they must be
      // sensitive.
      const unsub = byKey.get("mailchimp:unsubscribe_subscriber")!;
      expect(
        unsub.outputs.find((o) => o.name === "emailAddress")?.sensitive,
      ).toBe(true);
      expect(
        unsub.outputs.find((o) => o.name === "subscriberHash")?.sensitive,
      ).toBe(true);

      const cce = byKey.get("mailchimp:create_custom_event")!;
      expect(
        cce.outputs.find((o) => o.name === "subscriberEmail")?.sensitive,
      ).toBe(true);

      const gss = byKey.get("mailchimp:get_subscribers")!;
      expect(gss.outputs.find((o) => o.name === "subscribers")?.sensitive).toBe(
        true,
      );

      const note = byKey.get("mailchimp:add_note")!;
      expect(note.outputs.find((o) => o.name === "note")?.sensitive).toBe(true);

      const getSub = byKey.get("mailchimp:get_subscriber")!;
      expect(
        getSub.outputs.find((o) => o.name === "mergeFields")?.sensitive,
      ).toBe(true);
      expect(getSub.outputs.find((o) => o.name === "tags")?.sensitive).toBe(true);

      const audience = byKey.get("mailchimp:create_audience")!;
      expect(audience.outputs.find((o) => o.name === "name")?.sensitive).toBe(
        true,
      );

      const segment = byKey.get("mailchimp:create_segment")!;
      expect(segment.outputs.find((o) => o.name === "name")?.sensitive).toBe(
        true,
      );
    });

    it("Mailchimp meta outputs do NOT expose secret-shaped names (defense-in-depth)", () => {
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
      for (const m of mailchimp()) {
        for (const o of m.outputs) {
          expect(banned.has(o.name)).toBe(false);
        }
      }
    });

    it("mailchimp is now in COVERED_PROVIDERS — 14 action metas + 7 trigger metas (MAILCHIMP-4 closes the provider arc)", () => {
      const actionMetas = listAllActionMetas().filter(
        (m) => m.provider === "mailchimp",
      );
      expect(actionMetas).toHaveLength(14);
      const triggerMetas = listAllTriggerMetas().filter(
        (m) => m.provider === "mailchimp",
      );
      expect(triggerMetas).toHaveLength(7);
      expect(triggerMetas.map((m) => m.key)).toEqual([
        // Ordered by displayOrder (10..70).
        "mailchimp:audience_event",
        "mailchimp:campaign_created",
        "mailchimp:email_opened",
        "mailchimp:link_clicked",
        "mailchimp:new_audience",
        "mailchimp:segment_updated",
        "mailchimp:subscriber_added_to_segment",
      ]);
    });

    it("Mailchimp campaign-read actions (MAILCHIMP-4) are low-risk, use mailchimp:campaigns picker, expose campaignId field, and project nested sub-objects as OutputMeta.fields", () => {
      const byKey = new Map(mailchimp().map((m) => [m.key, m]));

      for (const key of [
        "mailchimp:get_campaign",
        "mailchimp:get_campaign_stats",
      ] as const) {
        const m = byKey.get(key)!;
        expect(m.riskLevel).toBe("low");
        expect(m.isDestructive).toBe(false);
        expect(m.requiresConfirmation).toBe(false);

        // Single required field: campaignId — combobox via mailchimp:campaigns.
        expect(m.fields.map((f) => f.name)).toEqual(["campaignId"]);
        const campaignField = m.fields[0]!;
        expect(campaignField.type).toBe("combobox");
        expect(campaignField.optionsSource).toBe("mailchimp:campaigns");
        expect(campaignField.required).toBe(true);
      }

      // get_campaign exposes nested settings + recipients sub-objects.
      const getCampaign = byKey.get("mailchimp:get_campaign")!;
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
      // archiveUrl + longArchiveUrl are sensitive top-level outputs.
      expect(
        getCampaign.outputs.find((o) => o.name === "archiveUrl")?.sensitive,
      ).toBe(true);
      expect(
        getCampaign.outputs.find((o) => o.name === "longArchiveUrl")?.sensitive,
      ).toBe(true);

      // get_campaign_stats nests the engagement aggregates as objects.
      const stats = byKey.get("mailchimp:get_campaign_stats")!;
      for (const nestedName of ["opens", "clicks", "bounces", "forwards"]) {
        const nested = stats.outputs.find((o) => o.name === nestedName)!;
        expect(nested.type).toBe("object");
        expect(nested.sensitive).toBe(true);
        expect(nested.fields?.length).toBeGreaterThan(0);
      }
      // industryStats stays structural (aggregate benchmarks; not customer data).
      const industry = stats.outputs.find((o) => o.name === "industryStats")!;
      expect(industry.type).toBe("object");
      expect(industry.sensitive).toBeFalsy();
    });

    it("listTriggerMetasForProvider('mailchimp') returns the 7 Mailchimp triggers in displayOrder, all category='marketing' + requiresIntegration=true", () => {
      const metas = listTriggerMetasForProvider("mailchimp");
      expect(metas).toHaveLength(7);
      for (const m of metas) {
        expect(m.category).toBe("marketing");
        expect(m.requiresIntegration).toBe(true);
      }
      const byKey = new Map(metas.map((m) => [m.key, m]));
      // 1 webhook + 6 polling activation modes.
      expect(byKey.get("mailchimp:audience_event")!.activation).toBe("webhook");
      for (const k of [
        "mailchimp:campaign_created",
        "mailchimp:email_opened",
        "mailchimp:link_clicked",
        "mailchimp:new_audience",
        "mailchimp:segment_updated",
        "mailchimp:subscriber_added_to_segment",
      ]) {
        expect(byKey.get(k)!.activation).toBe("polling");
      }
    });

    it("Mailchimp segment-scoped triggers (segment_updated, subscriber_added_to_segment) declare the listId → segmentId cascade via the MAILCHIMP-2 resolvers", () => {
      const metas = listTriggerMetasForProvider("mailchimp");
      const byKey = new Map(metas.map((m) => [m.key, m]));

      for (const key of [
        "mailchimp:segment_updated",
        "mailchimp:subscriber_added_to_segment",
      ] as const) {
        const m = byKey.get(key)!;
        const listId = m.fields.find((f) => f.name === "listId")!;
        expect(listId.type).toBe("combobox");
        expect(listId.optionsSource).toBe("mailchimp:audiences");
        expect(listId.required).toBe(true);

        const segmentId = m.fields.find((f) => f.name === "segmentId")!;
        expect(segmentId.type).toBe("combobox");
        expect(segmentId.optionsSource).toBe("mailchimp:segments");
        expect(segmentId.dependsOn).toBe("listId");
        expect(segmentId.required).toBe(true);
      }
    });

    it("Mailchimp audience_event trigger preserves field-name variance (audienceId, eventTypes string-array) and exposes the 6 allowed event types in its eventTypes description", () => {
      const metas = listTriggerMetasForProvider("mailchimp");
      const m = metas.find((x) => x.key === "mailchimp:audience_event")!;

      const audienceId = m.fields.find((f) => f.name === "audienceId")!;
      expect(audienceId.type).toBe("combobox");
      expect(audienceId.optionsSource).toBe("mailchimp:audiences");
      expect(audienceId.required).toBe(true);
      // camelCase preservation — must NOT be `audience_id` like the
      // snake-case actions.
      expect(m.fields.find((f) => f.name === "audience_id")).toBeUndefined();

      const eventTypes = m.fields.find((f) => f.name === "eventTypes")!;
      expect(eventTypes.type).toBe("string-array");
      expect(eventTypes.required).toBe(true);
      // The 6 allowed event types must surface in the description so
      // workflow authors know the allowlist without reading activate.ts.
      for (const allowed of [
        "subscribe",
        "unsubscribe",
        "profile",
        "upemail",
        "cleaned",
        "campaign",
      ]) {
        expect(eventTypes.description).toContain(allowed);
      }
    });

    it("Mailchimp trigger payloads mark PII + author-supplied content as sensitive (email, emailAddress, subscriberHash, campaign content, audience/segment names)", () => {
      const metas = listTriggerMetasForProvider("mailchimp");
      const byKey = new Map(metas.map((m) => [m.key, m]));
      const sensitiveOf = (key: string) =>
        new Set(
          byKey
            .get(key)!
            .payloadShape.filter((o) => o.sensitive === true)
            .map((o) => o.name),
        );

      // audience_event — email + subscriberHash + raw parsed body.
      expect(sensitiveOf("mailchimp:audience_event")).toEqual(
        new Set(["email", "subscriberHash", "parsed"]),
      );

      // campaign_created — author-supplied content + audience name.
      expect(sensitiveOf("mailchimp:campaign_created")).toEqual(
        new Set(["title", "subjectLine", "fromName", "replyTo", "audienceName"]),
      );

      // email_opened — email + subscriberId + author content.
      expect(sensitiveOf("mailchimp:email_opened")).toEqual(
        new Set(["campaignTitle", "subjectLine", "email", "subscriberId"]),
      );

      // link_clicked — email + subscriberId + author content + clicked URL.
      expect(sensitiveOf("mailchimp:link_clicked")).toEqual(
        new Set([
          "campaignTitle",
          "subjectLine",
          "email",
          "subscriberId",
          "url",
        ]),
      );

      // new_audience — audience name + company.
      expect(sensitiveOf("mailchimp:new_audience")).toEqual(
        new Set(["name", "company"]),
      );

      // segment_updated — segment name only.
      expect(sensitiveOf("mailchimp:segment_updated")).toEqual(
        new Set(["name"]),
      );

      // subscriber_added_to_segment — emailAddress + subscriberHash.
      expect(sensitiveOf("mailchimp:subscriber_added_to_segment")).toEqual(
        new Set(["emailAddress", "subscriberHash"]),
      );
    });

    it("Mailchimp trigger payloads do NOT expose secret-shaped names (defense-in-depth)", () => {
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
      for (const m of listTriggerMetasForProvider("mailchimp")) {
        for (const o of m.payloadShape) {
          expect(banned.has(o.name)).toBe(false);
        }
      }
    });
  });

  it("returns [] for an unknown provider", () => {
    expect(listActionMetasForProvider("nonexistent")).toEqual([]);
    expect(listTriggerMetasForProvider("nonexistent")).toEqual([]);
  });
});

describe("keyed accessors", () => {
  it("getActionMeta resolves a registered key", () => {
    const meta = getActionMeta("native:http_request");
    expect(meta).toBeDefined();
    expect(meta?.key).toBe("native:http_request");
  });

  it("getActionMeta resolves a GitHub key", () => {
    const meta = getActionMeta("github:create_issue");
    expect(meta).toBeDefined();
    expect(meta?.provider).toBe("github");
    expect(meta?.requiresIntegration).toBe(true);
  });

  it("getActionMeta returns undefined for an unregistered key", () => {
    expect(getActionMeta("native:nope")).toBeUndefined();
  });

  it("getTriggerMeta resolves a registered key", () => {
    const meta = getTriggerMeta("native:schedule.fired");
    expect(meta).toBeDefined();
    expect(meta?.activation).toBe("scheduled");
  });

  it("getTriggerMeta returns undefined for an unregistered key", () => {
    expect(getTriggerMeta("native:nope")).toBeUndefined();
  });
});

describe("listProvidersWithMetadata", () => {
  it("returns sorted unique provider ids covering native, github, gmail, slack, microsoft-outlook", () => {
    const providers = listProvidersWithMetadata();
    expect(providers).toContain("native");
    expect(providers).toContain("github");
    expect(providers).toContain("gmail");
    expect(providers).toContain("slack");
    expect(providers).toContain("microsoft-outlook");
    const sorted = [...providers].sort();
    expect(providers).toEqual(sorted);
    expect(new Set(providers).size).toBe(providers.length);
  });
});

// ─── Slice 3.SEC-2A — Action risk metadata coverage ─────────────────────────
//
// Every action in the registry MUST have its risk classification right.
// These assertions stop a future PR from silently introducing a destructive
// action without flagging it. The rules tested below are not aspirational —
// they reflect decisions made in Slice 3.SEC-2A:
//
//   - Every Stripe action that touches money is `riskLevel: "high"`.
//   - Stripe capturePaymentIntent / createRefund / cancelSubscription are
//     additionally `isDestructive` AND `requiresConfirmation` (the three
//     gates from F-C3 of the SEC-1 audit).
//   - `native:http_request` is `riskLevel: "high"` because it is an
//     unrestricted egress sink (F-C2 of the SEC-1 audit).
//   - Any action whose `type` ends in `delete_*` / `archive_*` /
//     `cancel_subscription` MUST be `isDestructive: true`. Reverse holds:
//     read/list/find/get actions MUST NOT be `isDestructive: true`.
describe("action risk metadata coverage (Slice 3.SEC-2A)", () => {
  function findAction(key: string): ActionMeta {
    const meta = listAllActionMetas().find((m) => m.key === key);
    if (!meta) throw new Error(`action meta '${key}' not in registry`);
    return meta;
  }

  describe("Stripe money-moving actions are riskLevel=high", () => {
    const STRIPE_HIGH_RISK_KEYS = [
      "stripe:create_payment_intent",
      "stripe:confirm_payment_intent",
      "stripe:capture_payment_intent",
      "stripe:create_refund",
      "stripe:create_subscription",
      "stripe:update_subscription",
      "stripe:cancel_subscription",
      "stripe:create_invoice",
    ] as const;

    for (const key of STRIPE_HIGH_RISK_KEYS) {
      it(`${key} declares riskLevel: "high"`, () => {
        expect(findAction(key).riskLevel).toBe("high");
      });
    }

    it("every high-risk Stripe action also documents WHY via riskDescription", () => {
      for (const key of STRIPE_HIGH_RISK_KEYS) {
        const m = findAction(key);
        expect(m.riskDescription).toBeDefined();
        expect(m.riskDescription!.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Stripe destructive money-moving actions require confirmation", () => {
    // The three actions where a single accidental fire causes real-world
    // financial impact that cannot be undone with a single inverse action.
    const STRIPE_CONFIRM_REQUIRED_KEYS = [
      "stripe:capture_payment_intent",
      "stripe:create_refund",
      "stripe:cancel_subscription",
    ] as const;

    for (const key of STRIPE_CONFIRM_REQUIRED_KEYS) {
      it(`${key} declares isDestructive AND requiresConfirmation`, () => {
        const meta = findAction(key);
        expect(meta.isDestructive).toBe(true);
        expect(meta.requiresConfirmation).toBe(true);
        expect(meta.riskLevel).toBe("high");
      });
    }
  });

  describe("Stripe high-risk money-moving NON-destructive actions require confirmation (Slice 3.POSTSEC-3)", () => {
    // Per POSTSEC-3 product decision: financially-consequential Stripe
    // actions that are NOT strictly irreversible still gate activation
    // and real Run-now on a typed CONFIRM. They are NOT marked
    // `isDestructive` (they have a reversible second-step path —
    // create_payment_intent can be canceled before capture,
    // create_subscription can be canceled, create_invoice can be voided
    // if still in `draft`, update_subscription can be reverted, etc.).
    // The SEC-2A consistency guard still requires `riskLevel: "high"`.
    const STRIPE_CONFIRM_NOT_DESTRUCTIVE_KEYS = [
      "stripe:create_payment_intent",
      "stripe:confirm_payment_intent",
      "stripe:create_subscription",
      "stripe:update_subscription",
      "stripe:create_invoice",
    ] as const;

    for (const key of STRIPE_CONFIRM_NOT_DESTRUCTIVE_KEYS) {
      it(`${key} declares requiresConfirmation AND riskLevel:high AND isDestructive:false`, () => {
        const meta = findAction(key);
        expect(meta.requiresConfirmation).toBe(true);
        expect(meta.riskLevel).toBe("high");
        // Critical: these are NOT destructive. Don't drift into the
        // destructive bucket — that would skip the careful product call
        // to keep them reversible-via-second-action.
        expect(meta.isDestructive).toBe(false);
      });
    }

    it("every POSTSEC-3 newly-confirmed Stripe action has a riskDescription mentioning money / billing / charge / payment", () => {
      const offenders: string[] = [];
      for (const key of STRIPE_CONFIRM_NOT_DESTRUCTIVE_KEYS) {
        const desc = findAction(key).riskDescription;
        if (!desc) {
          offenders.push(`${key} (no riskDescription)`);
          continue;
        }
        const d = desc.toLowerCase();
        const hasMoneyLanguage =
          d.includes("charge") ||
          d.includes("payment") ||
          d.includes("billing") ||
          d.includes("invoice") ||
          d.includes("proration") ||
          d.includes("recurring") ||
          d.includes("money");
        if (!hasMoneyLanguage) {
          offenders.push(`${key} (riskDescription does not mention money/billing/charge/payment)`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("Stripe full high-risk confirmation set (8 actions — destructive + non-destructive together)", () => {
    // Aggregated assertion: after POSTSEC-3, every Stripe high-risk
    // action requires typed confirmation. Adding a new Stripe write
    // without `requiresConfirmation: true` (or downgrading one) fails
    // this test loudly. Use this as the canonical "are we covered?"
    // single-shot check.
    const STRIPE_ALL_HIGH_RISK_CONFIRM_KEYS = [
      "stripe:create_payment_intent",
      "stripe:confirm_payment_intent",
      "stripe:capture_payment_intent",
      "stripe:create_refund",
      "stripe:create_subscription",
      "stripe:update_subscription",
      "stripe:cancel_subscription",
      "stripe:create_invoice",
    ] as const;

    it("all 8 Stripe high-risk write actions declare requiresConfirmation:true + riskLevel:high + non-empty riskDescription", () => {
      const offenders: string[] = [];
      for (const key of STRIPE_ALL_HIGH_RISK_CONFIRM_KEYS) {
        const meta = findAction(key);
        if (meta.riskLevel !== "high") {
          offenders.push(`${key} (riskLevel=${meta.riskLevel})`);
        }
        if (!meta.requiresConfirmation) {
          offenders.push(`${key} (requiresConfirmation=false)`);
        }
        if (!meta.riskDescription || meta.riskDescription.length === 0) {
          offenders.push(`${key} (missing riskDescription)`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it("medium / low Stripe actions do NOT require confirmation (no accidental escalation)", () => {
      const NON_CONFIRM_KEYS = [
        // medium
        "stripe:create_customer",
        "stripe:update_customer",
        "stripe:create_checkout_session",
        "stripe:create_payment_link",
        // low
        "stripe:find_customer",
        "stripe:find_payment_intent",
        "stripe:find_subscription",
        "stripe:get_payments",
      ] as const;
      const offenders: string[] = [];
      for (const key of NON_CONFIRM_KEYS) {
        const meta = findAction(key);
        if (meta.requiresConfirmation) {
          offenders.push(`${key} (requiresConfirmation=true unexpectedly)`);
        }
        if (meta.isDestructive) {
          offenders.push(`${key} (isDestructive=true unexpectedly)`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("Stripe non-write actions stay low risk", () => {
    const STRIPE_LOW_RISK_KEYS = [
      "stripe:find_customer",
      "stripe:find_payment_intent",
      "stripe:find_subscription",
      "stripe:get_payments",
    ] as const;

    for (const key of STRIPE_LOW_RISK_KEYS) {
      it(`${key} is low risk and not destructive`, () => {
        const meta = findAction(key);
        expect(meta.riskLevel).toBe("low");
        expect(meta.isDestructive).toBe(false);
        expect(meta.requiresConfirmation).toBe(false);
      });
    }
  });

  describe("native:http_request is high risk (arbitrary egress sink)", () => {
    it("declares riskLevel: high", () => {
      expect(findAction("native:http_request").riskLevel).toBe("high");
    });
    it("documents the egress concern in riskDescription", () => {
      const meta = findAction("native:http_request");
      expect(meta.riskDescription).toBeDefined();
      expect(meta.riskDescription!.toLowerCase()).toMatch(/egress|outbound|sink|http/);
    });
    it("is NOT destructive AND does NOT require confirmation (egress != irreversible)", () => {
      const meta = findAction("native:http_request");
      expect(meta.isDestructive).toBe(false);
      expect(meta.requiresConfirmation).toBe(false);
    });
  });

  describe("Native logic / transform actions stay low risk", () => {
    const LOW_RISK_NATIVE = [
      "native:delay",
      "native:format_transformer",
      "native:if_then_condition",
      "native:router",
    ] as const;

    for (const key of LOW_RISK_NATIVE) {
      it(`${key} is low risk and non-destructive`, () => {
        const meta = findAction(key);
        expect(meta.riskLevel).toBe("low");
        expect(meta.isDestructive).toBe(false);
        expect(meta.requiresConfirmation).toBe(false);
      });
    }
  });

  describe("Cross-provider destructive actions are flagged", () => {
    // Hand-curated list of every action whose runtime behavior matches the
    // F-C3 "destructive" definition: irreversible OR hard-to-reverse OR
    // hides data from the workspace until a separate restore call.
    const DESTRUCTIVE_KEYS = [
      "gmail:delete_email",
      "microsoft-outlook:delete_email",
      "slack:delete_message",
      "slack:archive_channel",
      "notion:archive_page",
      "stripe:capture_payment_intent",
      "stripe:create_refund",
      "stripe:cancel_subscription",
    ] as const;

    for (const key of DESTRUCTIVE_KEYS) {
      it(`${key} is isDestructive: true AND riskLevel: "high"`, () => {
        const meta = findAction(key);
        expect(meta.isDestructive).toBe(true);
        expect(meta.riskLevel).toBe("high");
      });
    }
  });

  describe("Pure read / list / find / get actions are NOT destructive", () => {
    // Audit guard: no `read-shaped` action key may carry isDestructive: true.
    // Catches future drift where a get/list/find handler is accidentally
    // misclassified.
    const READ_VERB_RE = /:(get|list|find|search|fetch|query)_/;

    it("every action whose type starts with a read verb is non-destructive", () => {
      const violators: string[] = [];
      for (const meta of listAllActionMetas()) {
        if (READ_VERB_RE.test(meta.key) && meta.isDestructive) {
          violators.push(meta.key);
        }
      }
      expect(violators).toEqual([]);
    });

    it("every action whose type starts with a read verb is at most medium risk", () => {
      const violators: string[] = [];
      for (const meta of listAllActionMetas()) {
        if (READ_VERB_RE.test(meta.key) && meta.riskLevel === "high") {
          violators.push(meta.key);
        }
      }
      expect(violators).toEqual([]);
    });
  });

  describe("Consistency invariants across the full registry", () => {
    it("isDestructive: true ALWAYS implies riskLevel: high", () => {
      const violators: string[] = [];
      for (const meta of listAllActionMetas()) {
        if (meta.isDestructive && meta.riskLevel !== "high") {
          violators.push(meta.key);
        }
      }
      expect(violators).toEqual([]);
    });

    it("requiresConfirmation: true ALWAYS implies riskLevel: high", () => {
      const violators: string[] = [];
      for (const meta of listAllActionMetas()) {
        if (meta.requiresConfirmation && meta.riskLevel !== "high") {
          violators.push(meta.key);
        }
      }
      expect(violators).toEqual([]);
    });

    it("every action declares a riskLevel from the enum {low, medium, high}", () => {
      const VALID: ReadonlySet<string> = new Set(["low", "medium", "high"]);
      const violators: string[] = [];
      for (const meta of listAllActionMetas()) {
        if (!VALID.has(meta.riskLevel)) {
          violators.push(`${meta.key}=${meta.riskLevel}`);
        }
      }
      expect(violators).toEqual([]);
    });
  });
});

// ─── Slice 3.SEC-7 — OutputMeta.sensitive backfill coverage ────────────────
//
// Pin the minimum set of outputs that MUST carry `sensitive: true` so that
// run-details API redaction + variable-picker masking fire on them. These
// are the most-critical leaks identified by the SEC-1 audit (F-H3, F-H4, F-C2).
// Adding new sensitive fields = adding the assertion here and to the meta.
describe("OutputMeta.sensitive coverage (Slice 3.SEC-7)", () => {
  function findOutput(actionKey: string, outputName: string) {
    const action = listAllActionMetas().find((m) => m.key === actionKey);
    if (!action) throw new Error(`action meta '${actionKey}' missing from registry`);
    const output = action.outputs.find((o) => o.name === outputName);
    if (!output) {
      throw new Error(
        `output '${outputName}' missing from '${actionKey}' (registered outputs: ${action.outputs.map((o) => o.name).join(", ")})`,
      );
    }
    return output;
  }

  describe("Stripe — customer email + payment URLs (clientSecret removed in SEC-8)", () => {
    it("stripe:create_customer.email is sensitive (output, not config)", () => {
      expect(findOutput("stripe:create_customer", "email").sensitive).toBe(true);
    });
    it("stripe:update_customer.email is sensitive (output)", () => {
      expect(findOutput("stripe:update_customer", "email").sensitive).toBe(true);
    });
    it("stripe:find_customer.customer is sensitive (object includes PII)", () => {
      expect(findOutput("stripe:find_customer", "customer").sensitive).toBe(true);
    });
    it("stripe:create_payment_link.url is sensitive (anyone with URL can pay)", () => {
      expect(findOutput("stripe:create_payment_link", "url").sensitive).toBe(true);
    });
    it("stripe:create_checkout_session.url is sensitive", () => {
      expect(findOutput("stripe:create_checkout_session", "url").sensitive).toBe(true);
    });
    it("stripe:create_invoice.hostedInvoiceUrl is sensitive", () => {
      expect(findOutput("stripe:create_invoice", "hostedInvoiceUrl").sensitive).toBe(true);
    });
    it("stripe:create_invoice.invoicePdf is sensitive", () => {
      expect(findOutput("stripe:create_invoice", "invoicePdf").sensitive).toBe(true);
    });
  });

  describe("native:http_request — response body + bodyJson", () => {
    it("body is sensitive (HTTP responses can carry secrets)", () => {
      expect(findOutput("native:http_request", "body").sensitive).toBe(true);
    });
    it("bodyJson is sensitive (parsed responses can carry tokens)", () => {
      expect(findOutput("native:http_request", "bodyJson").sensitive).toBe(true);
    });
  });

  describe("Notion — variable-shape property maps + user emails", () => {
    it("notion:get_page.properties is sensitive (row content varies; opaque)", () => {
      expect(findOutput("notion:get_page", "properties").sensitive).toBe(true);
    });
    it("notion:query_database.results is sensitive (rows may carry PII)", () => {
      expect(findOutput("notion:query_database", "results").sensitive).toBe(true);
    });
    it("notion:get_user.personEmail is sensitive", () => {
      expect(findOutput("notion:get_user", "personEmail").sensitive).toBe(true);
    });
  });

  describe("non-sensitive outputs stay non-sensitive (sanity check)", () => {
    // Verifies the backfill didn't over-mark harmless IDs.
    it("stripe:create_payment_intent.paymentIntentId is NOT sensitive", () => {
      expect(findOutput("stripe:create_payment_intent", "paymentIntentId").sensitive).toBeFalsy();
    });
    it("stripe:create_payment_intent.amount is NOT sensitive (echoed cents)", () => {
      expect(findOutput("stripe:create_payment_intent", "amount").sensitive).toBeFalsy();
    });
    it("stripe:create_customer.customerId is NOT sensitive (id only)", () => {
      expect(findOutput("stripe:create_customer", "customerId").sensitive).toBeFalsy();
    });
    it("native:http_request.status is NOT sensitive", () => {
      expect(findOutput("native:http_request", "status").sensitive).toBeFalsy();
    });
    it("native:http_request.headers is NOT sensitive (sensitive header values already stripped at handler layer)", () => {
      expect(findOutput("native:http_request", "headers").sensitive).toBeFalsy();
    });
  });

  // ─── Slice 3.POSTSEC-2 — sensitive-output drift cleanup ─────────────────
  //
  // Pin the metas the POSTSEC-1 audit identified as missing sensitive
  // flags on read-path arrays / domain projections / trigger payloads.
  // The structural test
  // `tests/structure/sensitive-output-coverage.test.ts` catches future
  // drift on naming patterns; these per-action pins fail loudly + locally
  // if the meta value regresses to an explicit `sensitive: false` or the
  // flag is deleted.
  describe("POSTSEC-2 sensitive-flag pins (read-path drift cleanup)", () => {
    it("gmail:search_emails.messages is sensitive (array of email projections)", () => {
      expect(findOutput("gmail:search_emails", "messages").sensitive).toBe(true);
    });
    it("microsoft-outlook:fetch_emails.messages is sensitive (array of email projections)", () => {
      expect(findOutput("microsoft-outlook:fetch_emails", "messages").sensitive).toBe(true);
    });
    it("slack:get_messages.messages is sensitive (message bodies)", () => {
      expect(findOutput("slack:get_messages", "messages").sensitive).toBe(true);
    });
    it("slack:get_thread_messages.messages is sensitive (message bodies)", () => {
      expect(findOutput("slack:get_thread_messages", "messages").sensitive).toBe(true);
    });
    it("slack:list_scheduled_messages.messages is sensitive (scheduled message bodies)", () => {
      expect(findOutput("slack:list_scheduled_messages", "messages").sensitive).toBe(true);
    });
    it("slack:update_message.text is sensitive (echoed body text)", () => {
      expect(findOutput("slack:update_message", "text").sensitive).toBe(true);
    });
    it("slack:send_channel_message.message is sensitive (response payload includes echoed text)", () => {
      expect(findOutput("slack:send_channel_message", "message").sensitive).toBe(true);
    });
    it("slack:send_direct_message.message is sensitive (response payload includes echoed text)", () => {
      expect(findOutput("slack:send_direct_message", "message").sensitive).toBe(true);
    });
    it("slack:post_interactive_blocks.message is sensitive (response payload includes echoed Block Kit body)", () => {
      expect(findOutput("slack:post_interactive_blocks", "message").sensitive).toBe(true);
    });
    it("slack:get_user_info.user is sensitive (Slack user record may include profile.email)", () => {
      expect(findOutput("slack:get_user_info", "user").sensitive).toBe(true);
    });
    it("slack:list_users.users is sensitive (per-row profile.email)", () => {
      expect(findOutput("slack:list_users", "users").sensitive).toBe(true);
    });
    it("slack:get_file_info.comments is sensitive (user-typed file comment bodies)", () => {
      expect(findOutput("slack:get_file_info", "comments").sensitive).toBe(true);
    });
    it("notion:list_comments.comments is sensitive (per-row plainText)", () => {
      expect(findOutput("notion:list_comments", "comments").sensitive).toBe(true);
    });
    it("notion:create_comment.plainText is sensitive (echoed comment body)", () => {
      expect(findOutput("notion:create_comment", "plainText").sensitive).toBe(true);
    });
    it("notion:get_block.plainText is sensitive (block body)", () => {
      expect(findOutput("notion:get_block", "plainText").sensitive).toBe(true);
    });
    it("notion:get_block.content is sensitive (type-specific block payload)", () => {
      expect(findOutput("notion:get_block", "content").sensitive).toBe(true);
    });
    it("notion:get_block_children.blocks is sensitive (per-row block bodies)", () => {
      expect(findOutput("notion:get_block_children", "blocks").sensitive).toBe(true);
    });
    it("notion:search.results is sensitive (raw Notion search hits — parity with query_database.results)", () => {
      expect(findOutput("notion:search", "results").sensitive).toBe(true);
    });
    it("notion:list_users.users is sensitive (per-row personEmail)", () => {
      expect(findOutput("notion:list_users", "users").sensitive).toBe(true);
    });
    it("stripe:find_payment_intent.paymentIntent is sensitive (projection carries receiptEmail + metadata)", () => {
      expect(findOutput("stripe:find_payment_intent", "paymentIntent").sensitive).toBe(true);
    });
    it("stripe:find_subscription.subscription is sensitive (projection carries customerId + metadata)", () => {
      expect(findOutput("stripe:find_subscription", "subscription").sensitive).toBe(true);
    });
    it("stripe:get_payments.payments is sensitive (per-row customerId + receiptUrl + metadata)", () => {
      expect(findOutput("stripe:get_payments", "payments").sensitive).toBe(true);
    });
    it("stripe:create_checkout_session.customerEmail is sensitive (echoed customer email PII)", () => {
      expect(findOutput("stripe:create_checkout_session", "customerEmail").sensitive).toBe(true);
    });
  });

  // ─── POSTSEC-2 — trigger payload sensitive pins ─────────────────────────
  //
  // Trigger payloadShape entries — same shape as ActionMeta.outputs but
  // delivered via TriggerMeta. POSTSEC-1 §5.2 + §7 identified the Outlook
  // trigger recipient arrays, Outlook trigger bodyPreview, and the GitHub
  // new_commit author-bearing fields as gaps.
  describe("POSTSEC-2 trigger payloadShape sensitive pins", () => {
    function findTriggerPayloadField(triggerKey: string, fieldName: string) {
      const trigger = listAllTriggerMetas().find((m) => m.key === triggerKey);
      if (!trigger) throw new Error(`trigger meta '${triggerKey}' missing from registry`);
      const field = trigger.payloadShape.find((p) => p.name === fieldName);
      if (!field) {
        throw new Error(
          `payloadShape field '${fieldName}' missing from '${triggerKey}' (registered fields: ${trigger.payloadShape.map((p) => p.name).join(", ")})`,
        );
      }
      return field;
    }

    it("microsoft-outlook:new_email payload.to is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:new_email", "to").sensitive).toBe(true);
    });
    it("microsoft-outlook:new_email payload.cc is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:new_email", "cc").sensitive).toBe(true);
    });
    it("microsoft-outlook:new_email payload.bodyPreview is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:new_email", "bodyPreview").sensitive).toBe(true);
    });
    it("microsoft-outlook:email_sent payload.to is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:email_sent", "to").sensitive).toBe(true);
    });
    it("microsoft-outlook:email_sent payload.cc is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:email_sent", "cc").sensitive).toBe(true);
    });
    it("microsoft-outlook:email_sent payload.bcc is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:email_sent", "bcc").sensitive).toBe(true);
    });
    it("microsoft-outlook:email_sent payload.bodyPreview is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:email_sent", "bodyPreview").sensitive).toBe(true);
    });
    it("microsoft-outlook:email_flagged payload.to is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:email_flagged", "to").sensitive).toBe(true);
    });
    it("microsoft-outlook:email_flagged payload.cc is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:email_flagged", "cc").sensitive).toBe(true);
    });
    it("microsoft-outlook:email_flagged payload.bodyPreview is sensitive", () => {
      expect(findTriggerPayloadField("microsoft-outlook:email_flagged", "bodyPreview").sensitive).toBe(true);
    });
    it("github:new_commit payload.head_commit is sensitive (author email + commit message)", () => {
      expect(findTriggerPayloadField("github:new_commit", "head_commit").sensitive).toBe(true);
    });
    it("github:new_commit payload.commits is sensitive (per-row author emails + messages)", () => {
      expect(findTriggerPayloadField("github:new_commit", "commits").sensitive).toBe(true);
    });
    it("github:new_commit payload.pusher is sensitive (pusher email)", () => {
      expect(findTriggerPayloadField("github:new_commit", "pusher").sensitive).toBe(true);
    });
  });

  // ─── POSTSEC-2 — Stripe regression guards (no clientSecret output) ─────
  //
  // Cross-action belt-and-suspenders: every Stripe action's outputs MUST
  // NOT include any name in the secret family. SEC-8 removed `clientSecret`
  // from PaymentIntent surfaces; this guard ensures no future Stripe
  // handler regresses by adding `secret`/`token`/`apiKey` etc.
  describe("POSTSEC-2 cross-action Stripe regression — no secret-shaped outputs", () => {
    it("no Stripe action declares a secret-shaped output name", () => {
      const BANNED = new Set([
        "clientSecret",
        "client_secret",
        "secret",
        "token",
        "apiKey",
        "accessToken",
        "refreshToken",
        "webhookSecret",
      ]);
      const offenders: string[] = [];
      for (const meta of listAllActionMetas()) {
        if (meta.provider !== "stripe") continue;
        for (const out of meta.outputs) {
          if (BANNED.has(out.name)) offenders.push(`${meta.key}.${out.name}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });
});
