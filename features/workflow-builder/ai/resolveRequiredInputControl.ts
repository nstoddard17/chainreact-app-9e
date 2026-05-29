import type { AiRequiredUserInput } from "@/lib/api/ai";

/**
 * Generic, metadata-driven control selection for React Agent required-input
 * entries (Slice 4.AI-35E).
 *
 * The single source of truth that maps one `requiredUserInput` entry to the
 * class of interactive control the chat should render — mirroring what the
 * workflow builder's config panel would render for the same underlying field.
 * Both `RequiredInputControl` (the renderer) and `isControlRenderable` (the
 * panel's control-vs-bullet split) consume this, so the two can never drift.
 *
 * The mapping is driven ONLY by the server-enriched FieldMeta hints
 * (`options` / `optionsSource` / `fieldType` / `multiple`) and the entry's
 * `kind` — never by provider id. There are NO provider-specific branches:
 * Slack, Gmail, Outlook, Stripe, Sheets, Airtable, Trello, Notion, HubSpot,
 * Microsoft, native nodes, and any future provider all flow through the same
 * metadata.
 *
 * Control kinds (each mirrors a config-modal field renderer):
 *   - `select`      — static enum, single-pick (also the `provider_choice` case).
 *   - `multiselect` — static enum, `multiple: true`.
 *   - `combobox`    — dynamic `optionsSource` resolver (async picker).
 *   - `boolean`     — `boolean` field → checkbox/toggle.
 *   - `number`      — `number` field → numeric input.
 *   - `textarea`    — `textarea` field → multi-line editor.
 *   - `text`        — single-line text, AND the safe fallback for any KNOWN
 *                     config field whose renderer has no dedicated chat control
 *                     yet (cron / string-array / file / keyvalue / …).
 *   - `bullet`      — NOT a control. Reserved for non-field clarifications that
 *                     cannot map to any known field/control.
 *
 * Note: the FieldType vocabulary has no `date` / `datetime` renderer (see
 * `contracts/actionMeta.ts:FieldTypeSchema`), so date-shaped config fields
 * surface today as `text`/`cron` and resolve to the closest available control
 * (a text input). When a dedicated date renderer lands in the contract, add a
 * case here and a branch in `RequiredInputControl` — no provider code changes.
 */

export type RequiredInputControlKind =
  | "select"
  | "multiselect"
  | "combobox"
  | "boolean"
  | "number"
  | "textarea"
  | "text"
  | "bullet";

export function resolveRequiredInputControl(
  input: AiRequiredUserInput,
): RequiredInputControlKind {
  const hasStaticOptions = (input.options?.length ?? 0) > 0;
  const hasOptionsSource = !!input.optionsSource;
  const isMultiple = input.multiple === true;

  // 1. Static enum options (incl. `provider_choice`, which always carries its
  //    own option list) → select / multi-select.
  if (hasStaticOptions && !hasOptionsSource) {
    return isMultiple ? "multiselect" : "select";
  }

  // 2. Dynamic resolver-backed field → async combobox (same resolver the
  //    config-modal picker uses). Multi-pick async is single-pick today.
  if (hasOptionsSource) {
    return "combobox";
  }

  // 3. Renderer type → matching scalar control. Mirrors the config-modal field
  //    renderers (BooleanField / NumberField / TextareaField / TextField …).
  switch (input.fieldType) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "textarea":
      return "textarea";
    case "text":
    case "cron":
    case "string-array":
    case "file":
    case "file-array":
    case "keyvalue":
    case "router-routes":
    case "select":
    case "combobox":
      // Known config field, but no dedicated chat control (or an options-less
      // select/combobox) → safe single-line text fallback.
      return "text";
  }

  // 4. No options + no field renderer hint. Render a control ONLY when the
  //    entry is a KNOWN config field — by explicit `config_value` kind, by
  //    `provider_choice` (defensive: in practice always option-bearing, caught
  //    at step 1), or by node/field identity. Everything else (a pure
  //    clarification / choose_trigger / variable_reference with no field
  //    identity) stays a static bullet.
  if (input.kind === "config_value" || input.kind === "provider_choice") return "text";
  if (input.field && input.nodeId) return "text";
  return "bullet";
}

/** Whether an entry renders as an interactive control (anything but a bullet). */
export function isRequiredInputControlRenderable(input: AiRequiredUserInput): boolean {
  return resolveRequiredInputControl(input) !== "bullet";
}
