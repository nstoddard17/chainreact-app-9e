/**
 * PICKER-MANUAL-ENTRY-AUDIT-1 — the picker ↔ manual-entry contract, checked
 * against every shipped ActionMeta / TriggerMeta.
 *
 * ── Why this guard exists ───────────────────────────────────────────────────
 *
 * `allowManualEntry` is a SINGLE flag that gates THREE user capabilities in the
 * field renderers (verified in ComboboxField / StringArrayField):
 *
 *   1. the "Use this ID: …" item that commits a typed value the resolver never
 *      returned (`showManualEntry`),
 *   2. the variable picker button — `showVariablePicker = allowManualEntry ===
 *      true` in ComboboxField, which is the ONLY way to set the field to
 *      `{{trigger.x}}` from the UI,
 *   3. (StringArrayField picker mode) appending a raw typed id as a chip.
 *
 * There is no separate "allow variables" flag. So a picker field that omits it
 * is picker-ONLY: whatever its description says, the user cannot paste an id and
 * cannot wire an upstream value.
 *
 * That made a whole class of defect invisible: `notion:list_comments.blockId`
 * was converted from a text box to a `notion:pages` picker and shipped copy
 * promising "wire `{{...}}` from an upstream step" that the renderer forbade.
 * Auditing the other 749 picker fields found the same contradiction across six
 * more providers.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * If a picker field's OWN shipped copy tells the user they may type, paste, or
 * wire a value, the renderer must actually allow it. The metadata is the product
 * decision; this test only enforces that the UI keeps the promise.
 *
 * The inverse is deliberately NOT asserted: a picker with no such promise is
 * free to stay picker-only, and several should (see PICKER_ONLY below). This
 * guard must never become "every selector accepts arbitrary text".
 */
import { ALL_ACTION_META, ALL_TRIGGER_META } from "@/services/discovery/_metaInventory";
import type { FieldMeta } from "@/contracts/actionMeta";

/**
 * Copy that promises a free value for THIS field. Deliberately narrow: it matches
 * "or paste a card id" / "or type a full path" / "or wire from upstream", and not
 * incidental words like "event types" or a "MANUAL / DYNAMIC" list classification.
 */
const PROMISES_FREE_VALUE =
  /or type a|or paste a|or paste\/wire|,\s*or type|,\s*or paste|or wire from|or type\/wire|must be typed manually|or type label|pick from the list or type|name,? or ID/i;

interface PickerField {
  readonly metaKey: string;
  readonly path: string;
  readonly field: FieldMeta;
}

function collect(): PickerField[] {
  const out: PickerField[] = [];
  const walk = (fields: readonly FieldMeta[], metaKey: string, prefix: string): void => {
    for (const field of fields) {
      if (field.optionsSource) out.push({ metaKey, path: `${prefix}${field.name}`, field });
      const sub = (field as { itemFields?: readonly FieldMeta[] }).itemFields;
      if (sub) walk(sub, metaKey, `${prefix}${field.name}[].`);
    }
  };
  for (const m of ALL_ACTION_META) walk(m.fields, m.key, "");
  for (const m of ALL_TRIGGER_META) walk(m.fields, m.key, "");
  return out;
}

const PICKER_FIELDS = collect();

/**
 * Fields that promise a free value in their copy but are intentionally
 * picker-only, each with the reason it is safe. Anything here is EXEMPT from the
 * rule above — so an entry is a product decision, not a way to silence a failure.
 */
const PICKER_ONLY: ReadonlyArray<{ id: string; reason: string }> = [
  // ── Generated metadata; needs a compiler change, not a metadata edit. ──
  // Linear's metas are emitted from `integrations/linear/mcp-catalog.ts` by
  // core/mcpCompile, whose `fieldOverrides` type has no `allowManualEntry` key.
  // Hand-editing the generated file would be silently reverted on the next
  // `npm run mcp:import -- generate linear`. Tracked as a follow-up.
  { id: "linear:find_issues.team", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:find_issues.label", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:find_issues.state", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:create_issue.team", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:create_issue.project", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:create_issue.state", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:create_issue.labels", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:update_issue.team", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:update_issue.project", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:update_issue.state", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
  { id: "linear:update_issue.labels", reason: "generated-meta: mcpCompile has no allowManualEntry override" },
];

const PICKER_ONLY_IDS = new Set(PICKER_ONLY.map((e) => e.id));

describe("picker fields keep the promise their own copy makes", () => {
  const promising = PICKER_FIELDS.filter((f) =>
    PROMISES_FREE_VALUE.test(`${f.field.description ?? ""} ~ ${f.field.placeholder ?? ""}`),
  );

  it("finds picker fields whose copy promises typing / pasting / wiring", () => {
    // Sanity: if this ever hits zero the regex has rotted and the table below
    // would silently pass for every field.
    expect(promising.length).toBeGreaterThan(20);
  });

  it.each(promising.map((f) => [`${f.metaKey}.${f.path}`, f] as const))(
    "%s allows the value its copy promises",
    (id, entry) => {
      if (PICKER_ONLY_IDS.has(id)) {
        // Documented exception — assert it is still genuinely picker-only so a
        // stale exemption can't hide a field that was since fixed.
        expect(entry.field.allowManualEntry).not.toBe(true);
        return;
      }
      expect(entry.field.allowManualEntry).toBe(true);
    },
  );
});

describe("the audit did not become a blanket rule", () => {
  it("most picker fields remain picker-only", () => {
    const manual = PICKER_FIELDS.filter((f) => f.field.allowManualEntry === true);
    // Enabling manual entry everywhere would defeat Rule 17's "real selector,
    // not a raw id box". The majority must stay closed.
    expect(manual.length).toBeLessThan(PICKER_FIELDS.length / 2);
  });

  /**
   * A resource whose SELECTION carries meaning a raw id cannot: HubSpot rejects
   * membership writes to DYNAMIC lists with a 400, and the picker surfaces each
   * list's `processingType` on the option description so the author can avoid
   * them. A typed id would route straight to that failure at run time.
   */
  it.each(["hubspot:add_contact_to_list", "hubspot:remove_from_list"])(
    "%s listId stays picker-only (DYNAMIC lists are rejected by the API)",
    (metaKey) => {
      const entry = PICKER_FIELDS.find((f) => f.metaKey === metaKey && f.path === "listId");
      expect(entry).toBeDefined();
      expect(entry!.field.optionsSource).toBe("hubspot:lists");
      expect(entry!.field.allowManualEntry).not.toBe(true);
    },
  );

  /**
   * Trigger-side filters have no upstream step to wire from — a trigger is the
   * first node — and the resolver enumerates every event type on the account.
   */
  it.each(["calendly:event_scheduled", "calendly:event_canceled"])(
    "%s eventTypeId stays picker-only (a trigger has no upstream values)",
    (metaKey) => {
      const entry = PICKER_FIELDS.find((f) => f.metaKey === metaKey && f.path === "eventTypeId");
      expect(entry).toBeDefined();
      expect(entry!.field.allowManualEntry).not.toBe(true);
    },
  );

  /**
   * UI-scope parents exist only to cascade the child picker; the handler ignores
   * them (their schemas say so). Typing an arbitrary value would mis-scope the
   * child list without changing what the step does at run time.
   */
  it.each([
    ["dropbox:download_file", "folderPath"],
    ["trello:add_comment", "boardId"],
    ["microsoft-onedrive:move_item", "parentItemId"],
  ])("%s %s stays picker-only (handler-ignored scoping selector)", (metaKey, path) => {
    const entry = PICKER_FIELDS.find((f) => f.metaKey === metaKey && f.path === path);
    expect(entry).toBeDefined();
    expect(entry!.field.allowManualEntry).not.toBe(true);
  });
});
