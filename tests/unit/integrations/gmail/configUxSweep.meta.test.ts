/** @jest-environment node */
/**
 * CONFIG-UX sweep (Group D) — Gmail builder-metadata pins.
 *
 * Guards the sweep's metadata-only changes:
 *   - `gmail:labels` option-source wiring on every raw label-id field
 *     (send_email.labels, search_emails.labelIds, remove_label.labelIds,
 *     new_email.labelIds, new_labeled_email.labelId) with
 *     `allowManualEntry` preserving the raw-id paste path. Stored value
 *     shapes are unchanged (string[] / single string).
 *   - search_emails mode-scoping: every filters-branch field is gated by
 *     `visibleWhen` on `searchMode`, and the gate values are exactly the
 *     runtime discriminated-union literals ("filters" / "query").
 *   - Advanced-tab demotions (pagination plumbing, byte-size filters,
 *     replyTo/signature niceties, Gmail-internal label visibility knobs).
 */

import { sendEmailMeta } from "@/integrations/gmail/actions/sendEmail.meta";
import { createDraftMeta } from "@/integrations/gmail/actions/createDraft.meta";
import { replyToEmailMeta } from "@/integrations/gmail/actions/replyToEmail.meta";
import { createDraftReplyMeta } from "@/integrations/gmail/actions/createDraftReply.meta";
import { searchEmailsMeta } from "@/integrations/gmail/actions/searchEmails.meta";
import { removeLabelMeta } from "@/integrations/gmail/actions/removeLabel.meta";
import { createLabelMeta } from "@/integrations/gmail/actions/createLabel.meta";
import { newEmailTriggerMeta } from "@/integrations/gmail/triggers/newEmail/newEmail.meta";
import { newLabeledEmailTriggerMeta } from "@/integrations/gmail/triggers/newLabeledEmail/newLabeledEmail.meta";
import { SearchEmailsConfigSchema } from "@/integrations/gmail/actions/searchEmails.schema";
import type { FieldMeta } from "@/contracts/actionMeta";

function field(fields: readonly FieldMeta[], name: string): FieldMeta {
  const f = fields.find((x) => x.name === name);
  if (!f) throw new Error(`Missing field '${name}'.`);
  return f;
}

describe("gmail:labels option-source wiring (CONFIG-UX sweep)", () => {
  it("send_email.labels — string-array chips backed by gmail:labels + manual entry", () => {
    const f = field(sendEmailMeta.fields, "labels");
    expect(f.type).toBe("string-array");
    expect(f.optionsSource).toBe("gmail:labels");
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(false);
  });

  it("search_emails.labelIds — string-array chips backed by gmail:labels + manual entry", () => {
    const f = field(searchEmailsMeta.fields, "labelIds");
    expect(f.type).toBe("string-array");
    expect(f.optionsSource).toBe("gmail:labels");
    expect(f.allowManualEntry).toBe(true);
  });

  it("remove_label.labelIds — required string-array backed by gmail:labels + manual entry", () => {
    const f = field(removeLabelMeta.fields, "labelIds");
    expect(f.type).toBe("string-array");
    expect(f.optionsSource).toBe("gmail:labels");
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true);
  });

  it("new_email trigger labelIds — keeps the ['INBOX'] default; backed by gmail:labels + manual entry", () => {
    const f = field(newEmailTriggerMeta.fields, "labelIds");
    expect(f.type).toBe("string-array");
    expect(f.optionsSource).toBe("gmail:labels");
    expect(f.allowManualEntry).toBe(true);
    expect(f.defaultValue).toEqual(["INBOX"]);
    // The old copy said "AND-match" while filters.ts matches ANY of the
    // labels — the rewritten copy must describe any-of semantics.
    expect(f.description!.toLowerCase()).toContain("at least one");
    expect(f.description).not.toContain("AND-match");
  });

  it("new_labeled_email trigger labelId — required single-value combobox backed by gmail:labels + manual entry", () => {
    const f = field(newLabeledEmailTriggerMeta.fields, "labelId");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("gmail:labels");
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true);
    // Single string value — never `multiple`.
    expect(f.multiple).toBeUndefined();
  });
});

describe("gmail:search_emails mode-scoping via visibleWhen (CONFIG-UX sweep)", () => {
  const FILTER_FIELDS = [
    "from",
    "to",
    "subject",
    "hasAttachment",
    "dateAfter",
    "dateBefore",
    "largerThan",
    "smallerThan",
    "labelIds",
    "hasWords",
    "doesntHaveWords",
  ] as const;

  it("searchMode stays an ungated required select whose values match the runtime union", () => {
    const mode = field(searchEmailsMeta.fields, "searchMode");
    expect(mode.type).toBe("select");
    expect(mode.required).toBe(true);
    expect(mode.defaultValue).toBe("filters");
    expect(mode.visibleWhen).toBeUndefined();
    expect(mode.options!.map((o) => o.value).sort()).toEqual([
      "filters",
      "query",
    ]);
    // The gate values are real runtime discriminator literals.
    expect(
      SearchEmailsConfigSchema.safeParse({ searchMode: "filters" }).success,
    ).toBe(true);
    expect(
      SearchEmailsConfigSchema.safeParse({ searchMode: "query", query: "x" })
        .success,
    ).toBe(true);
  });

  it.each(FILTER_FIELDS)(
    "%s is visible only in filters mode and drops the '(filter mode)' label suffix",
    (name) => {
      const f = field(searchEmailsMeta.fields, name);
      expect(f.visibleWhen).toEqual({
        field: "searchMode",
        valueIn: ["filters"],
      });
      expect(f.label.toLowerCase()).not.toContain("filter mode");
    },
  );

  it("query is visible only in raw-query mode, lives in Advanced, and drops the mode suffix", () => {
    const f = field(searchEmailsMeta.fields, "query");
    expect(f.visibleWhen).toEqual({ field: "searchMode", valueIn: ["query"] });
    expect(f.advanced).toBe(true);
    expect(f.label).toBe("Query");
  });

  it("byte-size filters + pagination plumbing are Advanced-tab knobs", () => {
    expect(field(searchEmailsMeta.fields, "largerThan").advanced).toBe(true);
    expect(field(searchEmailsMeta.fields, "smallerThan").advanced).toBe(true);
    expect(field(searchEmailsMeta.fields, "maxResults").advanced).toBe(true);
    expect(field(searchEmailsMeta.fields, "pageToken").advanced).toBe(true);
  });
});

describe("gmail Advanced-tab demotions (CONFIG-UX sweep)", () => {
  it.each([
    ["send_email", sendEmailMeta],
    ["create_draft", createDraftMeta],
    ["reply_to_email", replyToEmailMeta],
    ["create_draft_reply", createDraftReplyMeta],
  ] as const)("%s — replyTo + signature are advanced (optional niceties)", (_key, meta) => {
    const replyTo = field(meta.fields, "replyTo");
    const signature = field(meta.fields, "signature");
    expect(replyTo.advanced).toBe(true);
    expect(replyTo.required).toBe(false);
    expect(signature.advanced).toBe(true);
    expect(signature.required).toBe(false);
  });

  it("create_label — Gmail-internal visibility knobs are advanced with NO default (server default honored)", () => {
    const list = field(createLabelMeta.fields, "labelListVisibility");
    const msg = field(createLabelMeta.fields, "messageListVisibility");
    expect(list.advanced).toBe(true);
    expect(list.defaultValue).toBeUndefined();
    expect(msg.advanced).toBe(true);
    expect(msg.defaultValue).toBeUndefined();
  });
});
