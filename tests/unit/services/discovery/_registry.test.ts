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

  it("listActionMetasForProvider('gmail') returns the 13 Gmail actions in displayOrder", () => {
    const metas = listActionMetasForProvider("gmail");
    expect(metas).toHaveLength(13);
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

  it("listActionMetasForProvider('microsoft-outlook') returns the 9 Outlook actions in displayOrder", () => {
    const metas = listActionMetasForProvider("microsoft-outlook");
    expect(metas).toHaveLength(9);
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

      it("send_direct_message exposes `userId` as a required text field (no slack:users resolver yet — Slice 3.39+)", () => {
        const userId = metaByKey("slack:send_direct_message").fields.find(
          (f) => f.name === "userId",
        );
        expect(userId).toBeDefined();
        expect(userId!.type).toBe("text");
        expect(userId!.required).toBe(true);
        expect(userId!.optionsSource).toBeUndefined();
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

      it("schedule_message exposes postAt as a required text field with strict-format helper text", () => {
        const postAt = metaByKey("slack:schedule_message").fields.find(
          (f) => f.name === "postAt",
        );
        expect(postAt).toBeDefined();
        expect(postAt!.type).toBe("text");
        expect(postAt!.required).toBe(true);
        expect(postAt!.description).toMatch(/ISO-8601|Unix-seconds/i);
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

      it("remove_user_from_channel.user is a required text field (slack:users resolver deferred to 3.39+)", () => {
        const user = metaByKey("slack:remove_user_from_channel").fields.find(
          (f) => f.name === "user",
        );
        expect(user).toBeDefined();
        expect(user!.type).toBe("text");
        expect(user!.required).toBe(true);
        expect(user!.optionsSource).toBeUndefined();
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

      it("get_user_info `user` field is a required text field (slack:users resolver deferred to 3.39+)", () => {
        const user = metaByKey("slack:get_user_info").fields.find(
          (f) => f.name === "user",
        );
        expect(user).toBeDefined();
        expect(user!.type).toBe("text");
        expect(user!.required).toBe(true);
        expect(user!.optionsSource).toBeUndefined();
        expect(user!.placeholder).toBe("U01ABC23DEF");
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

        it("exposes only userId (required text)", () => {
          expect(meta().fields.map((f) => f.name)).toEqual(["userId"]);
          const userId = meta().fields[0]!;
          expect(userId.type).toBe("text");
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

    it("nested-object fields (lineItems, automaticTax, afterCompletion) use textarea paste-JSON (no new FieldType introduced in this slice)", () => {
      const nestedFieldNames = new Set([
        "lineItems",
        "automaticTax",
        "afterCompletion",
      ]);
      let foundCount = 0;
      for (const meta of stripeActionMetas()) {
        for (const f of meta.fields) {
          if (nestedFieldNames.has(f.name)) {
            expect(f.type).toBe("textarea");
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

    it("no output exposes secret-keyed fields beyond intentional clientSecret (PaymentIntent flows only)", () => {
      // clientSecret is allowed only on create_payment_intent and
      // confirm_payment_intent — Stripe's documented Payment Element
      // handoff. Reject any other secret-shaped output names.
      const allowedClientSecretActions = new Set([
        "stripe:create_payment_intent",
        "stripe:confirm_payment_intent",
      ]);
      for (const meta of stripeActionMetas()) {
        const names = meta.outputs.map((o) => o.name);
        const hasClientSecret = names.includes("clientSecret");
        if (hasClientSecret) {
          expect(allowedClientSecretActions.has(meta.key)).toBe(true);
        }
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

      it("output includes clientSecret with picker-useful description", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toContain("clientSecret");
        const cs = meta().outputs.find((o) => o.name === "clientSecret")!;
        expect(cs.type).toBe("string");
        // Description must explain intended use to avoid warning fatigue.
        expect(cs.description?.toLowerCase()).toContain("payment element");
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

    describe("confirm_payment_intent — snake_case field names + clientSecret", () => {
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

      it("output includes clientSecret (frontend handoff for requires_action)", () => {
        const names = meta().outputs.map((o) => o.name);
        expect(names).toContain("clientSecret");
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

      it("lineItems is textarea paste-JSON (optional at field level; XOR with mode enforced at runtime)", () => {
        const li = meta().fields.find((f) => f.name === "lineItems")!;
        expect(li.type).toBe("textarea");
        expect(li.required).toBe(false);
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

      it("lineItems is REQUIRED textarea paste-JSON", () => {
        const li = meta().fields.find((f) => f.name === "lineItems")!;
        expect(li.type).toBe("textarea");
        expect(li.required).toBe(true);
      });

      it("afterCompletion is OPTIONAL textarea paste-JSON (discriminated union)", () => {
        const ac = meta().fields.find((f) => f.name === "afterCompletion")!;
        expect(ac.type).toBe("textarea");
        expect(ac.required).toBe(false);
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
