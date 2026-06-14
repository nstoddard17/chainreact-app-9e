/**
 * @jest-environment node
 *
 * V2-READY-19 — email send/draft/reply meta default-config contract.
 *
 * The builder seeds a newly-added node's config from `meta.fields[].defaultValue`
 * (`deriveDefaultConfig` in the builder graph slice) and leaves fields WITHOUT a
 * defaultValue absent. These five Gmail/Outlook actions' Zod config schemas
 * REQUIRE the `subject` / `body` keys to be PRESENT (may be empty — the
 * documented "required by key" decision). The meta fields were `required:false`
 * with NO defaultValue, so the builder omitted the key and a user who never
 * touched the field built a node that failed at runtime with a config-failure.
 *
 * Each such field now carries `defaultValue:""`. This pins both sides so the
 * fix can't silently regress:
 *   (1) the meta defaults the key → the builder seeds it, and
 *   (2) the schema genuinely requires the key (rejects it absent, accepts ""),
 *       so the default is load-bearing — not cosmetic.
 */
import type { z } from "zod";
import type { ActionMeta } from "@/contracts/actionMeta";

import { sendEmailMeta } from "@/integrations/gmail/actions/sendEmail.meta";
import { SendEmailConfigSchema as GmailSendSchema } from "@/integrations/gmail/actions/sendEmail.schema";
import { createDraftMeta } from "@/integrations/gmail/actions/createDraft.meta";
import { CreateDraftConfigSchema as GmailDraftSchema } from "@/integrations/gmail/actions/createDraft.schema";
import { outlookSendEmailMeta } from "@/integrations/microsoft-outlook/actions/sendEmail.meta";
import { SendEmailConfigSchema as OutlookSendSchema } from "@/integrations/microsoft-outlook/actions/sendEmail.schema";
import { outlookCreateDraftEmailMeta } from "@/integrations/microsoft-outlook/actions/createDraftEmail.meta";
import { CreateDraftEmailConfigSchema as OutlookDraftSchema } from "@/integrations/microsoft-outlook/actions/createDraftEmail.schema";
import { outlookReplyToEmailMeta } from "@/integrations/microsoft-outlook/actions/replyToEmail.meta";
import { ReplyToEmailConfigSchema as OutlookReplySchema } from "@/integrations/microsoft-outlook/actions/replyToEmail.schema";

interface Case {
  label: string;
  meta: ActionMeta;
  schema: z.ZodTypeAny;
  /** A valid config that includes the defaulted fields as "" (what the builder produces). */
  validBase: Record<string, unknown>;
  /** Fields the meta must default to "" because the schema requires the key present. */
  defaultedFields: string[];
}

const cases: Case[] = [
  {
    label: "gmail:send_email",
    meta: sendEmailMeta,
    schema: GmailSendSchema,
    validBase: { to: ["a@b.com"], subject: "", textBody: "hi" },
    defaultedFields: ["subject"],
  },
  {
    label: "gmail:create_draft",
    meta: createDraftMeta,
    schema: GmailDraftSchema,
    validBase: { to: ["a@b.com"], subject: "", textBody: "hi" },
    defaultedFields: ["subject"],
  },
  {
    label: "microsoft-outlook:send_email",
    meta: outlookSendEmailMeta,
    schema: OutlookSendSchema,
    validBase: {
      to: ["a@b.com"],
      subject: "",
      body: "",
      isHtml: false,
      importance: "normal",
    },
    defaultedFields: ["subject", "body"],
  },
  {
    label: "microsoft-outlook:create_draft_email",
    meta: outlookCreateDraftEmailMeta,
    schema: OutlookDraftSchema,
    validBase: {
      to: ["a@b.com"],
      subject: "",
      body: "",
      isHtml: false,
      importance: "normal",
    },
    defaultedFields: ["subject", "body"],
  },
  {
    label: "microsoft-outlook:reply_to_email",
    meta: outlookReplyToEmailMeta,
    schema: OutlookReplySchema,
    validBase: { emailId: "msg-1", replyAll: false, body: "" },
    defaultedFields: ["body"],
  },
];

describe("email action meta default-config contract (V2-READY-19)", () => {
  for (const c of cases) {
    describe(c.label, () => {
      it("the builder's default-seeded valid config (keys present as '') passes the schema", () => {
        expect(c.schema.safeParse(c.validBase).success).toBe(true);
      });

      for (const field of c.defaultedFields) {
        it(`meta seeds '${field}' with defaultValue "" so the builder writes the key`, () => {
          const f = c.meta.fields.find((x) => x.name === field);
          expect(f).toBeDefined();
          expect(f!.defaultValue).toBe("");
        });

        it(`schema requires '${field}' present — omitting it fails (the default is load-bearing)`, () => {
          const without = { ...c.validBase };
          delete (without as Record<string, unknown>)[field];
          expect(c.schema.safeParse(without).success).toBe(false);
        });
      }
    });
  }
});
