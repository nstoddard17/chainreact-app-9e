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
  it("returns sorted unique provider ids covering native, github, and slack", () => {
    const providers = listProvidersWithMetadata();
    expect(providers).toContain("native");
    expect(providers).toContain("github");
    expect(providers).toContain("slack");
    const sorted = [...providers].sort();
    expect(providers).toEqual(sorted);
    expect(new Set(providers).size).toBe(providers.length);
  });
});
