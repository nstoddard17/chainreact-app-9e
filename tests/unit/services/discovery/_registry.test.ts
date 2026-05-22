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

    it("Slack action coverage as of Slice 3.27 is [download_file, upload_file] in displayOrder (broader Slack coverage is a future arc)", () => {
      const slackActionKeys = listActionMetasForProvider("slack").map(
        (m) => m.key,
      );
      expect(slackActionKeys).toEqual([
        "slack:download_file",
        "slack:upload_file",
      ]);
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

    it("`channel` is a required text field", () => {
      const channel = uploadMeta().fields.find((f) => f.name === "channel")!;
      expect(channel.type).toBe("text");
      expect(channel.required).toBe(true);
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
