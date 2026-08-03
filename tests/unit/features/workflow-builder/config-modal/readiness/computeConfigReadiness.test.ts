/** @jest-environment node */
/**
 * SPREADSHEET-CONFIG-REDESIGN-1 — pure readiness derivation behind the
 * NodeConfigReadinessBanner every config panel shows. Missing-item
 * counting reuses the metadata `required` flags (via the shared
 * `isRequiredValueMissing` ruleset); invalid state layers the draft's
 * inline errors + the shell's structural Save blockers on top; the Excel
 * add_row adapter supplies the richer either-or checklist.
 */
import type { FieldMeta } from "@/contracts/actionMeta";
import { computeConfigReadiness } from "@/features/workflow-builder/config-modal/readiness/computeConfigReadiness";
import type { ConfigConnectionInput } from "@/features/workflow-builder/config-modal/readiness/connectionInput";

const FIELDS: FieldMeta[] = [
  { name: "channelId", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels" },
  { name: "message", label: "Message", type: "textarea", required: true },
  { name: "iconEmoji", label: "Icon", type: "text", required: false },
];

const KEY = "slack:send_channel_message";

describe("computeConfigReadiness — generic (any provider)", () => {
  it("counts every empty required field: '2 things left to fill in' + checklist rows use field LABELS", () => {
    const r = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: {},
    });
    expect(r.status).toBe("incomplete");
    expect(r.headline).toBe("2 things left to fill in");
    expect(r.items).toEqual([
      { label: "Fill in Channel", done: false },
      { label: "Fill in Message", done: false },
    ]);
  });

  it("one missing required field → 'One thing left to fill in' with the filled item checked", () => {
    const r = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: { channelId: "C123" },
    });
    expect(r.status).toBe("incomplete");
    expect(r.headline).toBe("One thing left to fill in");
    expect(r.items).toEqual([
      { label: "Fill in Channel", done: true },
      { label: "Fill in Message", done: false },
    ]);
  });

  it("all required fields filled → 'Ready to run' for actions, 'Ready to activate' for triggers", () => {
    const values = { channelId: "C123", message: "hi" };
    expect(
      computeConfigReadiness({ metaKey: KEY, nodeKind: "action", fields: FIELDS, values }),
    ).toMatchObject({ status: "ready", headline: "Ready to run" });
    expect(
      computeConfigReadiness({ metaKey: KEY, nodeKind: "trigger", fields: FIELDS, values }),
    ).toMatchObject({ status: "ready", headline: "Ready to activate" });
  });

  it("a required field WITH a metadata default is never a gap (mirrors missingRequiredFields)", () => {
    const fields: FieldMeta[] = [
      { name: "mode", label: "Mode", type: "select", required: true, defaultValue: "ROWS", options: [{ value: "ROWS", label: "Rows" }] },
    ];
    const r = computeConfigReadiness({
      metaKey: "x:y",
      nodeKind: "action",
      fields,
      values: {},
    });
    expect(r.status).toBe("ready");
  });

  it("inline field errors win over missing items: 'Fix one field before saving'", () => {
    const r = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: {},
      errors: { message: "Too long." },
    });
    expect(r.status).toBe("invalid");
    expect(r.headline).toBe("Fix one field before saving");
  });

  it("structural Save blockers (advanced JSON / router) count as invalid fields too", () => {
    const r = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: { channelId: "C123", message: "hi" },
      blockedFieldCount: 1,
    });
    expect(r.status).toBe("invalid");
    expect(r.headline).toBe("Fix one field before saving");

    const two = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: {},
      errors: { message: "Too long." },
      blockedFieldCount: 1,
    });
    expect(two.headline).toBe("Fix 2 fields before saving");
  });

  it("copy never exposes schema keys or implementation words", () => {
    const surfaces = [
      computeConfigReadiness({ metaKey: KEY, nodeKind: "action", fields: FIELDS, values: {} }),
      computeConfigReadiness({ metaKey: KEY, nodeKind: "action", fields: FIELDS, values: { channelId: "C1", message: "hi" } }),
    ];
    for (const r of surfaces) {
      const text = [r.headline, ...r.items.map((i) => i.label)].join(" ");
      expect(text).not.toMatch(/channelId|iconEmoji|json|zod|schema|renderer|string-array|keyvalue/i);
    }
  });
});

describe("computeConfigReadiness — connection-aware (CONNECTION-AWARE-READINESS-1)", () => {
  const FILLED = { channelId: "C123", message: "hi" };
  const conn = (
    status: ConfigConnectionInput["status"],
    name = "Slack",
  ): ConfigConnectionInput => ({ status, providerDisplayName: name });

  it("missing connection blocks ready even when every field is valid, with Connect copy + CTA", () => {
    const r = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: FILLED,
      connection: conn("missing"),
    });
    expect(r.status).toBe("incomplete");
    expect(r.headline).toBe("Connect Slack to run this step");
    expect(r.items[0]).toEqual({ label: "Connect Slack", done: false });
    expect(r.cta).toEqual({ label: "Connect Slack", href: "/apps" });
  });

  it("reconnect-required and attention use reconnect copy without exposing internals", () => {
    const reconnect = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: FILLED,
      connection: conn("reconnect-required"),
    });
    expect(reconnect.headline).toBe("Reconnect Slack to run this step");
    expect(reconnect.cta).toEqual({ label: "Reconnect Slack", href: "/apps" });

    const attention = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: FILLED,
      connection: conn("attention"),
    });
    expect(attention.headline).toBe("Connection needs attention");
    expect(attention.status).toBe("incomplete");
  });

  it("checking / unknown never claim ready and add no guessed checklist row", () => {
    for (const [status, headline] of [
      ["checking", "Checking connection…"],
      ["unknown", "Couldn't check the app connection"],
    ] as const) {
      const r = computeConfigReadiness({
        metaKey: KEY,
        nodeKind: "action",
        fields: FIELDS,
        values: FILLED,
        connection: conn(status),
      });
      expect(r.status).toBe("incomplete");
      expect(r.headline).toBe(headline);
      expect(r.items.some((i) => /connect/i.test(i.label))).toBe(false);
    }
  });

  it("connected + missing fields shows missing-field readiness (not a connection warning), with the connected row checked", () => {
    const r = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: { channelId: "C123" },
      connection: conn("connected"),
    });
    expect(r.headline).toBe("One thing left to fill in");
    expect(r.items[0]).toEqual({ label: "Slack is connected", done: true });
    expect(r.cta).toBeUndefined();
  });

  it("connected + valid fields is Ready to run; blocking errors still outrank connection", () => {
    const ready = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: FILLED,
      connection: conn("connected"),
    });
    expect(ready).toMatchObject({ status: "ready", headline: "Ready to run" });

    const invalid = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: FILLED,
      errors: { message: "Too long." },
      connection: conn("missing"),
    });
    expect(invalid.status).toBe("invalid");
    expect(invalid.headline).toBe("Fix one field before saving");
  });

  it("triggers get activation wording for the connect headline", () => {
    const r = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "trigger",
      fields: FIELDS,
      values: FILLED,
      connection: conn("missing"),
    });
    expect(r.headline).toBe("Connect Slack to activate this trigger");
  });

  it("not-required (native nodes) keeps field-only readiness with no connection row", () => {
    const r = computeConfigReadiness({
      metaKey: KEY,
      nodeKind: "action",
      fields: FIELDS,
      values: FILLED,
      connection: conn("not-required"),
    });
    expect(r).toMatchObject({ status: "ready", headline: "Ready to run" });
    expect(r.items.some((i) => /connect/i.test(i.label))).toBe(false);
  });

  it("connection copy never exposes token/health/internal words", () => {
    for (const status of [
      "missing",
      "reconnect-required",
      "attention",
      "checking",
      "unknown",
    ] as const) {
      const r = computeConfigReadiness({
        metaKey: KEY,
        nodeKind: "action",
        fields: FIELDS,
        values: FILLED,
        connection: conn(status),
      });
      const text = [r.headline, ...r.items.map((i) => i.label), r.cta?.label ?? ""].join(" ");
      expect(text).not.toMatch(
        /token|oauth|health|integration row|scope|schema|zod|http|expired|capability/i,
      );
    }
  });
});

describe("computeConfigReadiness — Excel add_row adapter (spreadsheet checklist)", () => {
  const EXCEL_KEY = "microsoft-excel:add_row";

  it("nothing picked → '2 things left to fill in' (destination + row values)", () => {
    const r = computeConfigReadiness({
      metaKey: EXCEL_KEY,
      nodeKind: "action",
      fields: [],
      values: {},
    });
    expect(r.headline).toBe("2 things left to fill in");
    expect(r.items).toEqual([
      { label: "Pick a workbook and worksheet", done: false },
      { label: "Fill in at least one row value", done: false },
    ]);
  });

  it("destination picked but no row values → 'One thing left to fill in' with the destination checked", () => {
    const r = computeConfigReadiness({
      metaKey: EXCEL_KEY,
      nodeKind: "action",
      fields: [],
      values: { workbookId: "wb-1", worksheetName: "Sheet1" },
    });
    expect(r.status).toBe("incomplete");
    expect(r.headline).toBe("One thing left to fill in");
    expect(r.items).toEqual([
      { label: "Pick a workbook and worksheet", done: true },
      { label: "Fill in at least one row value", done: false },
    ]);
  });

  it("either save shape satisfies 'at least one row value' → 'Ready to run'", () => {
    const oneRow = computeConfigReadiness({
      metaKey: EXCEL_KEY,
      nodeKind: "action",
      fields: [],
      values: { workbookId: "wb-1", worksheetName: "Sheet1", values: ["Ada"] },
    });
    expect(oneRow).toMatchObject({ status: "ready", headline: "Ready to run" });

    const batch = computeConfigReadiness({
      metaKey: EXCEL_KEY,
      nodeKind: "action",
      fields: [],
      values: { workbookId: "wb-1", worksheetName: "Sheet1", rows: [{ Name: "Ada" }] },
    });
    expect(batch).toMatchObject({ status: "ready", headline: "Ready to run" });
  });
});
