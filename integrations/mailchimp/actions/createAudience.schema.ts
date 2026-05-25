import { z } from "zod";

/**
 * `create_audience` action schema — Slice 14 Commit 3.
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/createAudience.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createAudience.ts).
 *
 * **Compliance fields are required by Mailchimp**, NOT by V2 choice:
 *
 *   - `permission_reminder` — anti-spam law text shown to subscribers
 *     in every campaign explaining how they joined the list (e.g.
 *     "You signed up for updates on our website").
 *   - `contact` (physical mailing address) — required by CAN-SPAM
 *     Act § 5 (16 C.F.R. § 316.5). Every campaign sent from this
 *     audience embeds the contact address in the email footer.
 *   - `campaign_defaults` (from_name, from_email) — audience can't be
 *     created without them; Mailchimp uses them as the default sender
 *     identity for campaigns. `from_email` should be on a domain
 *     the account has verified (Mailchimp will fail-send otherwise).
 *
 * V2 keeps every field explicit at the schema layer — NO silent
 * defaults for legal-compliance fields, even for the boolean
 * `email_type_option` (V1 defaults it to false; V2 requires explicit
 * choice because it affects whether subscribers can opt into HTML vs
 * plain-text formats).
 *
 * Schema is strict — unknown fields throw.
 */

const ContactSchema = z
  .object({
    company: z.string().min(1),
    address1: z.string().min(1),
    address2: z.string().min(1).optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    zip: z.string().min(1),
    country: z.string().min(1),
    phone: z.string().min(1).optional(),
  })
  .strict();

const CampaignDefaultsSchema = z
  .object({
    from_name: z.string().min(1),
    from_email: z.string().email(),
    subject: z.string().min(1).optional(),
    language: z.string().min(1).optional(),
  })
  .strict();

export const CreateAudienceConfigSchema = z
  .object({
    name: z.string().min(1),
    permission_reminder: z.string().min(1),
    email_type_option: z.boolean(),
    contact: ContactSchema,
    campaign_defaults: CampaignDefaultsSchema,
    use_archive_bar: z.boolean().optional(),
    notify_on_subscribe: z.string().email().optional(),
    notify_on_unsubscribe: z.string().email().optional(),
    marketing_permissions: z.boolean().optional(),
    double_optin: z.boolean().optional(),
  })
  .strict();

export type CreateAudienceConfig = z.infer<typeof CreateAudienceConfigSchema>;
