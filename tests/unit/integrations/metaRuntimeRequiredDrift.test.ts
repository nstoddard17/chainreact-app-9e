/**
 * @jest-environment node
 *
 * WORKFLOW-TEST-RUNTIME-1 — metadata/runtime REQUIRED-FIELD drift guard.
 *
 * Readiness ("Ready" vs "Needs setup") is computed from `ActionMeta.fields[].required`, but the
 * contract that actually decides whether a run succeeds is the handler's resolved-config Zod
 * schema. When the two disagree in the direction "runtime requires it, metadata does not", the
 * builder shows Ready for a configuration the engine will reject — the node fails mid-run with no
 * prior warning. That is the exact class of bug that made a fully-configured-looking Google
 * Review Test unrunnable (`google-calendar:create_event` declared its date/time fields optional
 * while the schema required them per All Day mode).
 *
 * This guard pins the seam for the actions on the Google reviewer path. A required key MAY carry
 * a metadata `defaultValue` — `missingRequiredFields` treats a defaulted field as never-missing
 * because `deriveDefaultConfig` and the handler's own Zod `.default()` both supply it — but it
 * MUST still be declared `required: true` so the two contracts agree.
 *
 * NOT covered here (documented limitation, not an oversight): CROSS-FIELD refinements such as
 * `gmail:send_email` / `gmail:create_draft_reply` requiring "at least one of textBody or
 * htmlBody". `FieldMeta.required` is per-field and cannot express "one of", so readiness cannot
 * currently see those. Expressing them needs a new metadata concept; the drift below is what the
 * current model CAN and MUST express.
 */
import { getActionMeta } from "@/services/discovery/_registry";
import { UploadFileConfigSchema } from "@/integrations/google-drive/actions/uploadFile.schema";
import { AppendRowConfigSchema } from "@/integrations/google-sheets/actions/appendRow.schema";
import { CreateEventConfigSchema } from "@/integrations/google-calendar/actions/createEvent.schema";
import { AddLabelConfigSchema } from "@/integrations/gmail/actions/addLabel.schema";
import { CreateDraftReplyConfigSchema } from "@/integrations/gmail/actions/createDraftReply.schema";
import { SendEmailConfigSchema } from "@/integrations/gmail/actions/sendEmail.schema";

/** `provider:type` → its resolved-config schema. Extend as new actions join a reviewer path. */
const CASES: ReadonlyArray<readonly [string, unknown]> = [
  ["google-drive:upload_file", UploadFileConfigSchema],
  ["google-sheets:append_row", AppendRowConfigSchema],
  ["google-calendar:create_event", CreateEventConfigSchema],
  ["gmail:add_label", AddLabelConfigSchema],
  ["gmail:create_draft_reply", CreateDraftReplyConfigSchema],
  ["gmail:send_email", SendEmailConfigSchema],
];

/** Top-level keys the schema demands be PRESENT (unwrapping any .refine/.superRefine wrapper). */
function runtimeRequiredKeys(schema: unknown): string[] {
  const s = schema as { _def?: { schema?: unknown; shape?: () => Record<string, unknown> }; shape?: Record<string, unknown> };
  const base = (s._def?.schema ?? schema) as {
    _def?: { shape?: () => Record<string, unknown> };
    shape?: Record<string, unknown>;
  };
  const shape = base._def?.shape ? base._def.shape() : base.shape;
  if (!shape) throw new Error("could not unwrap schema shape");
  return Object.entries(shape)
    .filter(([, v]) => !(v as { isOptional?: () => boolean }).isOptional?.())
    .map(([k]) => k);
}

describe("metadata vs runtime required-field drift", () => {
  it.each(CASES.map(([key]) => [key]))(
    "%s declares every runtime-required key as required in its metadata",
    (key) => {
      const schema = CASES.find(([k]) => k === key)![1];
      const meta = getActionMeta(key as string)!;
      expect(meta).toBeDefined();
      const metaRequired = new Set(meta.fields.filter((f) => f.required).map((f) => f.name));
      const runtimeOnly = runtimeRequiredKeys(schema).filter((k) => !metaRequired.has(k));
      // Any name here reads as Ready in the builder and then fails at dispatch.
      expect({ key, runtimeRequiredButMetaOptional: runtimeOnly }).toEqual({
        key,
        runtimeRequiredButMetaOptional: [],
      });
    },
  );

  it("gmail:send_email keeps subject honest AND invisible (required, but defaulted)", () => {
    const subject = getActionMeta("gmail:send_email")!.fields.find((f) => f.name === "subject")!;
    // required so metadata matches SendEmailConfigSchema…
    expect(subject.required).toBe(true);
    // …defaulted so `missingRequiredFields` still never reports it as a user-facing setup gap.
    expect(subject.defaultValue).toBe("");
  });

  it("google-calendar:create_event declares its conditional date fields required-when-visible", () => {
    const meta = getActionMeta("google-calendar:create_event")!;
    for (const name of ["startDateTime", "endDateTime", "startDate", "endDate"]) {
      const field = meta.fields.find((f) => f.name === name)!;
      expect({ name, required: field.required, scoped: Boolean(field.visibleWhen) }).toEqual({
        name,
        required: true,
        scoped: true,
      });
    }
  });
});
