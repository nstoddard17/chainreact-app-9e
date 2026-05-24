/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-4 — Microsoft OneNote discovery registry assertions.
 *
 * Pins:
 *   - 12 OneNote action metas registered (no more, no less).
 *   - 0 trigger metas — polling triggers ship in ONENOTE-5.
 *   - All 12 keys present, no duplicates.
 *   - All actions are `category: "files"` + `requiresIntegration: true`.
 *   - Sorted by displayOrder 10..120.
 *   - Per-meta field-name preservation (camelCase, mirrors ONENOTE-2
 *     runtime schemas verbatim — no normalization).
 *   - Per-meta resolver wiring matches ONENOTE-3 resolver keys
 *     (`microsoft-onenote:notebooks` / `:sections` / `:pages`).
 *   - Per-meta sensitive-output flags match the ONENOTE-4 spec.
 *   - delete_page is the lone destructive trio (high + isDestructive
 *     + requiresConfirmation).
 *   - copy_page description warns about async operationLocation +
 *     `success != complete` semantics.
 *   - create_page contentType defaults to `text/html` (V2 D-ON1).
 *   - Deferred raw OData `filter` field is absent from list_pages.
 *   - No secret-shaped output names anywhere.
 *   - copy_page targetSectionId is `text` (not combobox — dual-
 *     hierarchy picker limitation documented in description).
 */
import {
  getActionMeta,
  getTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("Microsoft OneNote action metas — registration", () => {
  const EXPECTED_KEYS = [
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
  ];

  it("registers exactly 12 OneNote action metas", () => {
    const metas = listActionMetasForProvider("microsoft-onenote");
    expect(metas).toHaveLength(12);
  });

  it.each(EXPECTED_KEYS)("registers %s", (key) => {
    expect(getActionMeta(key)).toBeDefined();
  });

  it("registers 2 OneNote trigger metas in ONENOTE-5 (new_note + updated_note polling; Graph deprecated OneNote webhooks May 2023)", () => {
    const triggers = listTriggerMetasForProvider("microsoft-onenote");
    expect(triggers).toHaveLength(2);
    expect(triggers.map((t) => t.key)).toEqual([
      "microsoft-onenote:new_note",
      "microsoft-onenote:updated_note",
    ]);
    expect(triggers.every((t) => t.activation === "polling")).toBe(true);
    expect(triggers.every((t) => t.requiresIntegration === true)).toBe(true);
    expect(triggers.every((t) => t.category === "files")).toBe(true);
  });

  it("sorts OneNote actions by displayOrder 10..120 in 10-step increments", () => {
    const metas = listActionMetasForProvider("microsoft-onenote");
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS);
    const orders = metas.map((m) => m.displayOrder);
    expect(orders).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  });

  it("all 12 actions are category=files + requiresIntegration=true", () => {
    const metas = listActionMetasForProvider("microsoft-onenote");
    expect(metas.every((m) => m.category === "files")).toBe(true);
    expect(metas.every((m) => m.requiresIntegration === true)).toBe(true);
  });

  it("no OneNote meta produces or consumes a FileRef (PDF export is not in V2-v1 scope)", () => {
    const metas = listActionMetasForProvider("microsoft-onenote");
    expect(metas.every((m) => m.producesFileRef === false)).toBe(true);
    expect(metas.every((m) => m.consumesFileRef === false)).toBe(true);
  });
});

describe("create_page meta — V2-v1 text/html default + cascade", () => {
  const meta = getActionMeta("microsoft-onenote:create_page")!;

  it("preserves runtime field names verbatim (camelCase): notebookId / sectionId / title / content / contentType", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "title",
      "content",
      "contentType",
    ]);
  });

  it("notebookId wires microsoft-onenote:notebooks with NO deps (top-level picker)", () => {
    const field = meta.fields.find((f) => f.name === "notebookId")!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("microsoft-onenote:notebooks");
    expect(field.dependsOn).toBeUndefined();
    expect(field.required).toBe(true);
  });

  it("sectionId wires microsoft-onenote:sections dependsOn notebookId", () => {
    const field = meta.fields.find((f) => f.name === "sectionId")!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("microsoft-onenote:sections");
    expect(field.dependsOn).toBe("notebookId");
    expect(field.required).toBe(true);
  });

  it("contentType defaults to text/html (V2 D-ON1) — flipped from V1's text/plain", () => {
    const field = meta.fields.find((f) => f.name === "contentType")!;
    expect(field.type).toBe("select");
    expect(field.required).toBe(true);
    expect(field.defaultValue).toBe("text/html");
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "application/xhtml+xml",
      "text/html",
      "text/plain",
    ]);
  });

  it("content is textarea + optional (schema defaults to empty string)", () => {
    const field = meta.fields.find((f) => f.name === "content")!;
    expect(field.type).toBe("textarea");
    expect(field.required).toBe(false);
  });

  it("risk: medium, not destructive, no confirmation", () => {
    expect(meta.riskLevel).toBe("medium");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });

  it("title + webUrl + contentUrl marked sensitive; id + timestamps + level/order NOT sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("title")?.sensitive).toBe(true);
    expect(out.get("webUrl")?.sensitive).toBe(true);
    expect(out.get("contentUrl")?.sensitive).toBe(true);
    expect(out.get("id")?.sensitive).toBeUndefined();
    expect(out.get("createdDateTime")?.sensitive).toBeUndefined();
    expect(out.get("lastModifiedDateTime")?.sensitive).toBeUndefined();
    expect(out.get("level")?.sensitive).toBeUndefined();
    expect(out.get("order")?.sensitive).toBeUndefined();
  });
});

describe("update_page meta — 3-level cascade + replace warning", () => {
  const meta = getActionMeta("microsoft-onenote:update_page")!;

  it("preserves field names verbatim and exposes 3-level cascade chain", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "pageId",
      "updateMode",
      "content",
      "target",
      "position",
    ]);
  });

  it("cascade wiring: notebookId (no deps) → sectionId (deps notebookId) → pageId (deps sectionId)", () => {
    const nb = meta.fields.find((f) => f.name === "notebookId")!;
    const sec = meta.fields.find((f) => f.name === "sectionId")!;
    const pg = meta.fields.find((f) => f.name === "pageId")!;
    expect(nb.optionsSource).toBe("microsoft-onenote:notebooks");
    expect(nb.dependsOn).toBeUndefined();
    expect(sec.optionsSource).toBe("microsoft-onenote:sections");
    expect(sec.dependsOn).toBe("notebookId");
    expect(pg.optionsSource).toBe("microsoft-onenote:pages");
    expect(pg.dependsOn).toBe("sectionId");
  });

  it("updateMode is select + required + 4-value V1 enum (append/prepend/replace/insert), default append", () => {
    const field = meta.fields.find((f) => f.name === "updateMode")!;
    expect(field.type).toBe("select");
    expect(field.required).toBe(true);
    expect(field.defaultValue).toBe("append");
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "append",
      "insert",
      "prepend",
      "replace",
    ]);
  });

  it("position enum has 3 values (after/before/inside), default after", () => {
    const field = meta.fields.find((f) => f.name === "position")!;
    expect(field.type).toBe("select");
    expect(field.defaultValue).toBe("after");
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "after",
      "before",
      "inside",
    ]);
  });

  it("target is optional text (REQUIRED at runtime when updateMode=insert per schema superRefine)", () => {
    const field = meta.fields.find((f) => f.name === "target")!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(false);
  });

  it("description warns replace mode wipes body + OneNote version-history recovery", () => {
    expect(meta.description).toMatch(/replace.*wipe/i);
    expect(meta.description).toMatch(/version history/i);
    expect(meta.description).toMatch(/not through chainreact/i);
  });

  it("description mentions Graph update semantics differ from a real-time editor", () => {
    expect(meta.description).toMatch(/graph.*not.*real-time|differ/i);
  });

  it("risk: medium, not destructive, no confirmation", () => {
    expect(meta.riskLevel).toBe("medium");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });

  it("title + webUrl + contentUrl marked sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("title")?.sensitive).toBe(true);
    expect(out.get("webUrl")?.sensitive).toBe(true);
    expect(out.get("contentUrl")?.sensitive).toBe(true);
    expect(out.get("id")?.sensitive).toBeUndefined();
    expect(out.get("success")?.sensitive).toBeUndefined();
  });
});

describe("copy_page meta — async + dual-hierarchy picker limitation", () => {
  const meta = getActionMeta("microsoft-onenote:copy_page")!;

  it("source-side cascade: notebookId → sectionId → sourcePageId (combobox triple)", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "sourcePageId",
      "targetSectionId",
    ]);
    const sp = meta.fields.find((f) => f.name === "sourcePageId")!;
    expect(sp.type).toBe("combobox");
    expect(sp.optionsSource).toBe("microsoft-onenote:pages");
    expect(sp.dependsOn).toBe("sectionId");
  });

  it("targetSectionId is TEXT not combobox (dual-hierarchy picker limitation)", () => {
    const ts = meta.fields.find((f) => f.name === "targetSectionId")!;
    expect(ts.type).toBe("text");
    expect(ts.optionsSource).toBeUndefined();
    expect(ts.required).toBe(true);
  });

  it("description warns about async Graph operation: success means accepted, NOT complete", () => {
    expect(meta.description).toMatch(/asynchronous|async/i);
    expect(meta.description).toMatch(/accepted.*not.*complete|success.*not.*complete/i);
  });

  it("description mentions the dual-picker limitation + list_sections workaround", () => {
    expect(meta.description).toMatch(/list_sections/i);
    expect(meta.description).toMatch(/deferred|polish|limitation/i);
  });

  it("output exposes operationLocation + success boolean", () => {
    const names = meta.outputs.map((o) => o.name).sort();
    expect(names).toEqual([
      "operationLocation",
      "sourcePageId",
      "success",
      "targetSectionId",
    ]);
  });

  it("risk: medium, not destructive, no confirmation", () => {
    expect(meta.riskLevel).toBe("medium");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });

  it("riskDescription clarifies success != complete", () => {
    expect(meta.riskDescription).toMatch(/asynchronous|accepted.*not.*complete/i);
  });
});

describe("delete_page meta — destructive trio + 3-level cascade", () => {
  const meta = getActionMeta("microsoft-onenote:delete_page")!;

  it("preserves field names verbatim + 3-level cascade chain", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "pageId",
    ]);
  });

  it("isDestructive: true + requiresConfirmation: true + riskLevel: high", () => {
    expect(meta.isDestructive).toBe(true);
    expect(meta.requiresConfirmation).toBe(true);
    expect(meta.riskLevel).toBe("high");
  });

  it("riskDescription mentions irreversibility + no Graph recycle-bin endpoint", () => {
    expect(meta.riskDescription).toBeDefined();
    expect(meta.riskDescription!.toLowerCase()).toMatch(/irreversible|recycle|recovery|cannot/);
  });

  it("description warns about no Graph recycle-bin + per-notebook recycle-bin caveat", () => {
    expect(meta.description).toMatch(/irreversible|destructive/i);
    expect(meta.description).toMatch(/recycle.bin|no.*recovery/i);
  });

  it("output is STRUCTURAL only — no title / body / content echoed", () => {
    const names = meta.outputs.map((o) => o.name).sort();
    expect(names).toEqual(["deletedAt", "deletedPageId", "success"]);
    // Defense-in-depth — these suspicious names MUST NOT appear at all
    // on a destructive delete output.
    for (const out of meta.outputs) {
      expect(["title", "body", "content", "messages"]).not.toContain(out.name);
    }
  });

  it("pageId picker depends on sectionId (3-level cascade scopes deletion)", () => {
    const pg = meta.fields.find((f) => f.name === "pageId")!;
    expect(pg.type).toBe("combobox");
    expect(pg.optionsSource).toBe("microsoft-onenote:pages");
    expect(pg.dependsOn).toBe("sectionId");
    expect(pg.required).toBe(true);
  });
});

describe("get_page_content meta — pure read + camelCase booleans", () => {
  const meta = getActionMeta("microsoft-onenote:get_page_content")!;

  it("preserves field names verbatim including camelCase booleans (includeIDs / preGenerated)", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "pageId",
      "includeIDs",
      "preGenerated",
    ]);
  });

  it("includeIDs boolean defaults false (matches schema)", () => {
    const field = meta.fields.find((f) => f.name === "includeIDs")!;
    expect(field.type).toBe("boolean");
    expect(field.required).toBe(false);
    expect(field.defaultValue).toBe(false);
  });

  it("preGenerated boolean defaults true (matches schema)", () => {
    const field = meta.fields.find((f) => f.name === "preGenerated")!;
    expect(field.type).toBe("boolean");
    expect(field.required).toBe(false);
    expect(field.defaultValue).toBe(true);
  });

  it("description notes includeIDs load-bearing for update_page insert mode", () => {
    expect(meta.description).toMatch(/includeIDs.*insert|insert.*includeIDs/i);
    expect(meta.description).toMatch(/data-id/i);
  });

  it("risk: low (pure read)", () => {
    expect(meta.riskLevel).toBe("low");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });

  it("content + title + contentUrl + webUrl marked sensitive (PII / addressable)", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("content")?.sensitive).toBe(true);
    expect(out.get("title")?.sensitive).toBe(true);
    expect(out.get("contentUrl")?.sensitive).toBe(true);
    expect(out.get("webUrl")?.sensitive).toBe(true);
    expect(out.get("id")?.sensitive).toBeUndefined();
  });
});

describe("list_pages meta — deferred OData filter absent", () => {
  const meta = getActionMeta("microsoft-onenote:list_pages")!;

  it("preserves field names verbatim: notebookId / sectionId / top / orderBy", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "top",
      "orderBy",
    ]);
  });

  it("does NOT expose V1's raw OData `filter` field (deferred per ONENOTE-1 §4.1 D-defer)", () => {
    expect(meta.fields.find((f) => f.name === "filter")).toBeUndefined();
  });

  it("top is number with bounds 1..100 + default 20 (Graph cap for OneNote pages)", () => {
    const field = meta.fields.find((f) => f.name === "top")!;
    expect(field.type).toBe("number");
    expect(field.defaultValue).toBe(20);
    expect(field.numeric).toEqual({
      min: 1,
      max: 100,
      integer: true,
      step: 1,
    });
  });

  it("orderBy is select with 6 values, default 'lastModifiedDateTime desc'", () => {
    const field = meta.fields.find((f) => f.name === "orderBy")!;
    expect(field.type).toBe("select");
    expect(field.defaultValue).toBe("lastModifiedDateTime desc");
    expect(field.options?.length).toBe(6);
  });

  it("pages[] marked sensitive (bulk PII collection)", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("pages")?.sensitive).toBe(true);
    expect(out.get("count")?.sensitive).toBeUndefined();
    expect(out.get("hasMore")?.sensitive).toBeUndefined();
    expect(out.get("nextLink")?.sensitive).toBeUndefined();
  });
});

describe("list_sections meta — bulk sensitive + cascade", () => {
  const meta = getActionMeta("microsoft-onenote:list_sections")!;

  it("preserves field names: notebookId / orderBy", () => {
    expect(meta.fields.map((f) => f.name)).toEqual(["notebookId", "orderBy"]);
  });

  it("notebookId picker is required (matches schema)", () => {
    const nb = meta.fields.find((f) => f.name === "notebookId")!;
    expect(nb.optionsSource).toBe("microsoft-onenote:notebooks");
    expect(nb.required).toBe(true);
  });

  it("sections[] marked sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("sections")?.sensitive).toBe(true);
  });
});

describe("list_notebooks meta — account-scoped, no parent picker", () => {
  const meta = getActionMeta("microsoft-onenote:list_notebooks")!;

  it("only field is orderBy (matches schema — no notebookId parent)", () => {
    expect(meta.fields.map((f) => f.name)).toEqual(["orderBy"]);
  });

  it("notebooks[] marked sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("notebooks")?.sensitive).toBe(true);
  });
});

describe("create_section meta — notebookId required", () => {
  const meta = getActionMeta("microsoft-onenote:create_section")!;

  it("preserves field names: notebookId / displayName", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "displayName",
    ]);
  });

  it("displayName + pagesUrl marked sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("displayName")?.sensitive).toBe(true);
    expect(out.get("pagesUrl")?.sensitive).toBe(true);
    expect(out.get("id")?.sensitive).toBeUndefined();
  });

  it("risk: medium", () => {
    expect(meta.riskLevel).toBe("medium");
    expect(meta.isDestructive).toBe(false);
  });
});

describe("create_notebook meta — single displayName field", () => {
  const meta = getActionMeta("microsoft-onenote:create_notebook")!;

  it("only field is displayName (matches schema)", () => {
    expect(meta.fields.map((f) => f.name)).toEqual(["displayName"]);
  });

  it("displayName + sectionsUrl + sectionGroupsUrl marked sensitive", () => {
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("displayName")?.sensitive).toBe(true);
    expect(out.get("sectionsUrl")?.sensitive).toBe(true);
    expect(out.get("sectionGroupsUrl")?.sensitive).toBe(true);
  });
});

describe("get_notebook_details meta + get_section_details meta — pure reads", () => {
  it("get_notebook_details has just notebookId picker", () => {
    const meta = getActionMeta("microsoft-onenote:get_notebook_details")!;
    expect(meta.fields.map((f) => f.name)).toEqual(["notebookId"]);
    expect(meta.riskLevel).toBe("low");
    const out = new Map(meta.outputs.map((o) => [o.name, o]));
    expect(out.get("displayName")?.sensitive).toBe(true);
    expect(out.get("links")?.sensitive).toBe(true);
  });

  it("get_section_details cascades notebookId → sectionId", () => {
    const meta = getActionMeta("microsoft-onenote:get_section_details")!;
    expect(meta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
    ]);
    const sec = meta.fields.find((f) => f.name === "sectionId")!;
    expect(sec.dependsOn).toBe("notebookId");
    expect(meta.riskLevel).toBe("low");
  });
});

describe("OneNote meta secret-shape guards (defense-in-depth)", () => {
  it("no meta output uses a secret-shaped name (token / secret / api_key / etc.)", () => {
    const FORBIDDEN = new Set([
      "token",
      "secret",
      "clientSecret",
      "client_secret",
      "apiKey",
      "accessToken",
      "refreshToken",
      "webhookSecret",
    ]);
    const metas = listActionMetasForProvider("microsoft-onenote");
    for (const meta of metas) {
      for (const out of meta.outputs) {
        expect(FORBIDDEN.has(out.name)).toBe(false);
      }
    }
  });

  it("no meta field has both `options` and `optionsSource` (contract guard)", () => {
    const metas = listActionMetasForProvider("microsoft-onenote");
    for (const meta of metas) {
      for (const f of meta.fields) {
        if (f.options && f.optionsSource) {
          throw new Error(
            `${meta.key}.${f.name} declares both options and optionsSource`,
          );
        }
      }
    }
  });

  it("only delete_page is the destructive trio across the 12 actions", () => {
    const metas = listActionMetasForProvider("microsoft-onenote");
    const destructive = metas.filter((m) => m.isDestructive);
    expect(destructive.map((m) => m.key)).toEqual([
      "microsoft-onenote:delete_page",
    ]);
    const confirmable = metas.filter((m) => m.requiresConfirmation);
    expect(confirmable.map((m) => m.key)).toEqual([
      "microsoft-onenote:delete_page",
    ]);
    const high = metas.filter((m) => m.riskLevel === "high");
    expect(high.map((m) => m.key)).toEqual([
      "microsoft-onenote:delete_page",
    ]);
  });

  it("every meta uses camelCase field names (no snake_case drift)", () => {
    const metas = listActionMetasForProvider("microsoft-onenote");
    for (const meta of metas) {
      for (const f of meta.fields) {
        expect(f.name).not.toMatch(/_/);
      }
    }
  });
});

describe("new_note trigger meta (ONENOTE-5)", () => {
  const meta = getTriggerMeta("microsoft-onenote:new_note")!;

  it("activation: polling + requiresIntegration true + category files", () => {
    expect(meta.activation).toBe("polling");
    expect(meta.requiresIntegration).toBe(true);
    expect(meta.category).toBe("files");
  });

  it("fields are notebookId + sectionId cascade (both required)", () => {
    expect(meta.fields.map((f) => f.name)).toEqual(["notebookId", "sectionId"]);
    const sec = meta.fields.find((f) => f.name === "sectionId")!;
    expect(sec.dependsOn).toBe("notebookId");
    expect(sec.optionsSource).toBe("microsoft-onenote:sections");
    expect(sec.required).toBe(true);
    const nb = meta.fields.find((f) => f.name === "notebookId")!;
    expect(nb.optionsSource).toBe("microsoft-onenote:notebooks");
    expect(nb.required).toBe(true);
  });

  it("payloadShape carries metadata only — NO body/content fields", () => {
    const names = meta.payloadShape.map((p) => p.name);
    expect(names).toEqual([
      "changeKind",
      "pageId",
      "title",
      "webUrl",
      "contentUrl",
      "notebookId",
      "notebookName",
      "sectionId",
      "sectionName",
      "createdDateTime",
      "lastModifiedDateTime",
    ]);
    for (const banned of ["content", "body", "text", "messages", "snippet"]) {
      expect(names).not.toContain(banned);
    }
  });

  it("title / webUrl / contentUrl / notebookName / sectionName marked sensitive", () => {
    const byName = new Map(meta.payloadShape.map((p) => [p.name, p]));
    for (const k of ["title", "webUrl", "contentUrl", "notebookName", "sectionName"]) {
      expect(byName.get(k)?.sensitive).toBe(true);
    }
    for (const k of [
      "pageId",
      "notebookId",
      "sectionId",
      "createdDateTime",
      "lastModifiedDateTime",
      "changeKind",
    ]) {
      expect(byName.get(k)?.sensitive).toBeUndefined();
    }
  });

  it("description warns about polling architecture (no webhook subscriptions for OneNote)", () => {
    expect(meta.description.toLowerCase()).toMatch(/polling|polls/);
    expect(meta.description.toLowerCase()).toMatch(/deprecated|may 2023|polling.*architecture/);
  });
});

describe("updated_note trigger meta (ONENOTE-5)", () => {
  const meta = getTriggerMeta("microsoft-onenote:updated_note")!;

  it("activation: polling + requiresIntegration true + category files", () => {
    expect(meta.activation).toBe("polling");
    expect(meta.requiresIntegration).toBe(true);
    expect(meta.category).toBe("files");
  });

  it("fields are notebookId + sectionId + optional pageId (3-level cascade)", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "pageId",
    ]);
    const sec = meta.fields.find((f) => f.name === "sectionId")!;
    expect(sec.dependsOn).toBe("notebookId");
    expect(sec.required).toBe(true);
    const pg = meta.fields.find((f) => f.name === "pageId")!;
    expect(pg.optionsSource).toBe("microsoft-onenote:pages");
    expect(pg.dependsOn).toBe("sectionId");
    expect(pg.required).toBe(false); // pageId is the optional filter
  });

  it("payloadShape mirrors new_note (changeKind: 'updated')", () => {
    const names = meta.payloadShape.map((p) => p.name);
    expect(names).toEqual([
      "changeKind",
      "pageId",
      "title",
      "webUrl",
      "contentUrl",
      "notebookId",
      "notebookName",
      "sectionId",
      "sectionName",
      "createdDateTime",
      "lastModifiedDateTime",
    ]);
    for (const banned of ["content", "body", "text", "messages", "snippet"]) {
      expect(names).not.toContain(banned);
    }
  });

  it("sensitive flags match new_note pattern", () => {
    const byName = new Map(meta.payloadShape.map((p) => [p.name, p]));
    for (const k of ["title", "webUrl", "contentUrl", "notebookName", "sectionName"]) {
      expect(byName.get(k)?.sensitive).toBe(true);
    }
  });

  it("description warns about brand-new-page exclusion (no double-fire with new_note)", () => {
    expect(meta.description.toLowerCase()).toMatch(/brand.new|new note|don't fire|not fire/i);
  });

  it("description documents composite dedup key (multiple updates over time fire each)", () => {
    expect(meta.description.toLowerCase()).toMatch(
      /multiple updates|dedup|modification timestamp/i,
    );
  });
});

