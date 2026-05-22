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
