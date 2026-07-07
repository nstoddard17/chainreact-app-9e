/**
 * CONFIG-UX-AUDIT-1 — builder config copy guard.
 *
 * Product rule: workflow authors configure steps VISUALLY. The app may
 * serialize config to JSON internally, but a normal user must never be
 * asked to hand-author JSON, and internal implementation language must
 * never leak into the setup panel.
 *
 * This guard scans EVERY builder-visible action + trigger field
 * (discovery registry = exactly what the builder renders) and enforces:
 *
 *   1. Field LABELS never contain "JSON" (any casing) — labels are pure
 *      product language, no exceptions.
 *   2. Field descriptions/placeholders of NORMAL (non-advanced) fields
 *      never contain JSON-authoring phrases ("paste JSON", "raw JSON",
 *      "JSON array", "JSON object", "JSON-encoded", "as JSON", …).
 *      Fields marked `advanced: true` render inside the collapsed
 *      Advanced disclosure and MAY mention JSON — they are the explicit
 *      developer escape hatch.
 *   3. `multiple: true` appears only on select/combobox (contract-
 *      enforced) AND those fields have options or an optionsSource, so
 *      the multi-select renderer never hits its drift fallback.
 *   4. select/combobox fields always declare options XOR optionsSource
 *      (renderer never shows the "choices aren't available" fallback for
 *      a well-formed meta).
 *
 * Allowlist: `native:http_request` is a developer-facing action by
 * design (raw HTTP body/headers); its field copy may reference JSON
 * without the advanced flag.
 */
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import type { FieldMeta } from "@/contracts/actionMeta";

/** Actions whose ENTIRE audience is developers; JSON copy allowed. */
const DEVELOPER_ACTION_ALLOWLIST = new Set(["native:http_request"]);

const BANNED_NORMAL_COPY = [
  /paste\s+(a\s+)?json/i,
  /raw\s+json/i,
  /json\s+array/i,
  /json\s+object/i,
  /json[- ]encoded/i,
  /as\s+json/i,
  /json\s+literal/i,
];

interface FieldRef {
  metaKey: string;
  field: FieldMeta;
}

function collectAllFields(): FieldRef[] {
  const out: FieldRef[] = [];
  for (const meta of listAllActionMetas()) {
    for (const field of meta.fields) out.push({ metaKey: meta.key, field });
  }
  for (const meta of listAllTriggerMetas()) {
    for (const field of meta.fields) out.push({ metaKey: meta.key, field });
  }
  return out;
}

describe("builder config copy guard (CONFIG-UX-AUDIT-1)", () => {
  const all = collectAllFields();

  it("sanity: the registry exposes a non-trivial field surface", () => {
    expect(all.length).toBeGreaterThan(300);
  });

  it("no field LABEL contains 'JSON' — labels are product language, no exceptions", () => {
    const offenders = all
      .filter(({ field }) => /json/i.test(field.label))
      .map(({ metaKey, field }) => `${metaKey}.${field.name}: "${field.label}"`);
    expect(offenders).toEqual([]);
  });

  it("NORMAL (non-advanced) field descriptions/placeholders never ask the user for JSON", () => {
    const offenders: string[] = [];
    for (const { metaKey, field } of all) {
      if (field.advanced === true) continue;
      if (DEVELOPER_ACTION_ALLOWLIST.has(metaKey)) continue;
      const surfaces = [field.description ?? "", field.placeholder ?? ""];
      for (const text of surfaces) {
        for (const banned of BANNED_NORMAL_COPY) {
          if (banned.test(text)) {
            offenders.push(
              `${metaKey}.${field.name} matches ${String(banned)}: "${text.slice(0, 120)}"`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("advanced JSON escape hatches are textarea-only and never required-by-stealth outside the disclosure", () => {
    // Every advanced field must be a textarea (the JSON escape-hatch
    // shape); the SchemaForm disclosure auto-opens when an advanced
    // field is required, so required+advanced is allowed but pinned
    // here so additions are deliberate.
    const advanced = all.filter(({ field }) => field.advanced === true);
    expect(advanced.length).toBeGreaterThan(0);
    for (const { metaKey, field } of advanced) {
      expect(`${metaKey}.${field.name}:${field.type}`).toBe(
        `${metaKey}.${field.name}:textarea`,
      );
    }
  });

  it("multiple: true fields always carry options or an optionsSource (multi-select never hits the drift fallback)", () => {
    const offenders = all
      .filter(({ field }) => field.multiple === true)
      .filter(
        ({ field }) =>
          !(field.options && field.options.length > 0) && !field.optionsSource,
      )
      .map(({ metaKey, field }) => `${metaKey}.${field.name}`);
    expect(offenders).toEqual([]);
  });

  it("select/combobox fields declare options XOR optionsSource (single-select never renders the 'choices unavailable' fallback)", () => {
    const offenders: string[] = [];
    for (const { metaKey, field } of all) {
      if (field.type !== "select" && field.type !== "combobox") continue;
      const hasStatic = Boolean(field.options && field.options.length > 0);
      const hasSource = Boolean(field.optionsSource);
      if (hasStatic === hasSource) {
        offenders.push(
          `${metaKey}.${field.name} (options: ${hasStatic}, optionsSource: ${hasSource})`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("internal renderer-mismatch strings never appear in any builder-visible copy", () => {
    const INTERNAL_STRINGS = [
      /not supported by this renderer/i,
      /not yet implemented/i,
      /field-renderer registry/i,
    ];
    const offenders: string[] = [];
    for (const { metaKey, field } of all) {
      const surfaces = [field.label, field.description ?? "", field.placeholder ?? ""];
      for (const text of surfaces) {
        for (const banned of INTERNAL_STRINGS) {
          if (banned.test(text)) {
            offenders.push(`${metaKey}.${field.name}: "${text.slice(0, 80)}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
