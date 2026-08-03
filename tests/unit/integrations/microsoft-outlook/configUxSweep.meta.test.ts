/** @jest-environment node */
/**
 * CONFIG-UX sweep (Group D) — Microsoft Outlook builder-metadata pins.
 *
 * Guards the sweep's metadata-only changes:
 *   - `microsoft-outlook:folders` option-source wiring on all 4 raw folder
 *     fields (move_email.destinationFolderId, fetch_emails.folderId,
 *     new_email.folder, email_flagged.folder) — combobox + allowManualEntry
 *     so well-known names / raw Graph ids still paste through; the stored
 *     value stays a single string.
 *   - get_attachment mode-scoping: fileExtensions / fileNameFilter are
 *     required-when-visible, gated on downloadMode values that exist in
 *     the runtime schema's enum.
 *   - fetch_emails startDate/endDate use `datetime-utc` (commits the same
 *     ISO-8601 `...Z` string the schema accepted as text).
 *   - send_email node description no longer claims attachments are
 *     unavailable in the builder (the field ships).
 *   - Q11 required-no-default fields stay required with no default.
 */

import { outlookMoveEmailMeta } from "@/integrations/microsoft-outlook/actions/moveEmail.meta";
import { outlookFetchEmailsMeta } from "@/integrations/microsoft-outlook/actions/fetchEmails.meta";
import { outlookGetAttachmentMeta } from "@/integrations/microsoft-outlook/actions/getAttachment.meta";
import { outlookSendEmailMeta } from "@/integrations/microsoft-outlook/actions/sendEmail.meta";
import { outlookCreateDraftEmailMeta } from "@/integrations/microsoft-outlook/actions/createDraftEmail.meta";
import { outlookReplyToEmailMeta } from "@/integrations/microsoft-outlook/actions/replyToEmail.meta";
import { outlookNewEmailTriggerMeta } from "@/integrations/microsoft-outlook/triggers/newEmail/newEmail.meta";
import { outlookEmailFlaggedTriggerMeta } from "@/integrations/microsoft-outlook/triggers/emailFlagged/emailFlagged.meta";
import { GetAttachmentConfigSchema } from "@/integrations/microsoft-outlook/actions/getAttachment.schema";
import type { FieldMeta } from "@/contracts/actionMeta";

function field(fields: readonly FieldMeta[], name: string): FieldMeta {
  const f = fields.find((x) => x.name === name);
  if (!f) throw new Error(`Missing field '${name}'.`);
  return f;
}

describe("microsoft-outlook:folders option-source wiring (CONFIG-UX sweep)", () => {
  it.each([
    ["move_email.destinationFolderId", outlookMoveEmailMeta.fields, "destinationFolderId", true],
    ["fetch_emails.folderId", outlookFetchEmailsMeta.fields, "folderId", false],
    ["new_email trigger folder", outlookNewEmailTriggerMeta.fields, "folder", false],
    ["email_flagged trigger folder", outlookEmailFlaggedTriggerMeta.fields, "folder", false],
  ] as const)(
    "%s — single-value combobox backed by microsoft-outlook:folders + manual entry",
    (_label, fields, name, required) => {
      const f = field(fields, name);
      expect(f.type).toBe("combobox");
      expect(f.optionsSource).toBe("microsoft-outlook:folders");
      expect(f.allowManualEntry).toBe(true);
      expect(f.required).toBe(required);
      // Single string value — never `multiple`.
      expect(f.multiple).toBeUndefined();
    },
  );
});

describe("microsoft-outlook:get_attachment mode-scoping (CONFIG-UX sweep)", () => {
  it("fileExtensions — required-when-visible, gated on downloadMode 'by_extension'", () => {
    const f = field(outlookGetAttachmentMeta.fields, "fileExtensions");
    expect(f.type).toBe("string-array");
    expect(f.required).toBe(true);
    expect(f.visibleWhen).toEqual({
      field: "downloadMode",
      valueIn: ["by_extension"],
    });
    expect(f.label.toLowerCase()).not.toContain("mode only");
  });

  it("fileNameFilter — required-when-visible, gated on downloadMode 'by_name'", () => {
    const f = field(outlookGetAttachmentMeta.fields, "fileNameFilter");
    expect(f.type).toBe("text");
    expect(f.required).toBe(true);
    expect(f.visibleWhen).toEqual({
      field: "downloadMode",
      valueIn: ["by_name"],
    });
    expect(f.label.toLowerCase()).not.toContain("mode only");
  });

  it("gate values exist in the runtime schema's downloadMode enum", () => {
    expect(
      GetAttachmentConfigSchema.safeParse({
        emailId: "m1",
        downloadMode: "by_extension",
        fileExtensions: ["pdf"],
      }).success,
    ).toBe(true);
    expect(
      GetAttachmentConfigSchema.safeParse({
        emailId: "m1",
        downloadMode: "by_name",
        fileNameFilter: "invoice",
      }).success,
    ).toBe(true);
    // The controller itself must not be conditionally visible (single hop).
    expect(field(outlookGetAttachmentMeta.fields, "downloadMode").visibleWhen).toBeUndefined();
  });
});

describe("microsoft-outlook:fetch_emails temporal fields (CONFIG-UX sweep)", () => {
  it("startDate / endDate are datetime-utc (commit shape stays an ISO-8601 Z string)", () => {
    expect(field(outlookFetchEmailsMeta.fields, "startDate").type).toBe("datetime-utc");
    expect(field(outlookFetchEmailsMeta.fields, "endDate").type).toBe("datetime-utc");
  });
});

describe("microsoft-outlook copy honesty + Q11 requiredness (CONFIG-UX sweep)", () => {
  it("send_email node description no longer claims attachments are unavailable", () => {
    expect(outlookSendEmailMeta.description).not.toContain("not yet exposed");
    // The attachments field genuinely ships.
    expect(field(outlookSendEmailMeta.fields, "attachments").type).toBe("file-array");
  });

  it.each([
    ["send_email", outlookSendEmailMeta],
    ["create_draft_email", outlookCreateDraftEmailMeta],
  ] as const)("%s — isHtml/importance stay required with NO default (Q11)", (_key, meta) => {
    const isHtml = field(meta.fields, "isHtml");
    const importance = field(meta.fields, "importance");
    expect(isHtml.required).toBe(true);
    expect(isHtml.defaultValue).toBeUndefined();
    expect(importance.required).toBe(true);
    expect(importance.defaultValue).toBeUndefined();
  });

  it("reply_to_email.replyAll stays required with NO default (Q11) and outcome-first copy", () => {
    const f = field(outlookReplyToEmailMeta.fields, "replyAll");
    expect(f.required).toBe(true);
    expect(f.defaultValue).toBeUndefined();
    // Endpoint jargon removed from the setup description.
    expect(f.description).not.toContain("/reply");
    expect(f.description).not.toContain("Q11");
  });
});
