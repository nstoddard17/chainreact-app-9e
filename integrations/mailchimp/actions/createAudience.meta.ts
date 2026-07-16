import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:create_audience`.
 *
 * Mirrors `createAudience.schema.ts`. **Mailchimp's compliance
 * requirements are non-negotiable** — `contact` (physical mailing
 * address per CAN-SPAM § 5 / 16 C.F.R. § 316.5),
 * `permission_reminder` (anti-spam reminder text shown in every
 * campaign), and `campaign_defaults` (default from-name + from-email)
 * are all required by Mailchimp's API. V2 mirrors these as schema-
 * required so misuse fails at validation time, not at API call time.
 *
 * `contact` and `campaign_defaults` are flat fixed-key objects; the
 * builder surface exposes them as `object` fixed-key editors
 * (CONFIG-UX-SETUP-ADVANCED-1) on the NORMAL setup path — they are
 * required compliance fields, so they must not hide behind the
 * Advanced disclosure. `itemFields` mirror the runtime `.strict()`
 * schema keys verbatim (`ContactSchema` / `CampaignDefaultsSchema` in
 * `createAudience.schema.ts`); the editor commits the identical
 * `Record<string, string>` shape the schema always expected.
 *
 * Output: `name` is sensitive (audience name surfaces in workflow
 * outputs — workflow authors may name audiences with customer-
 * identifying business data). `audienceId` / `webId` / `dateCreated` /
 * `memberCount` are structural and stay non-sensitive.
 *
 * Risk: medium — creates a new Mailchimp list with the compliance text
 * the author supplied. Mailchimp owns subsequent send mechanics; this
 * action only stands up the audience shell.
 */
export const mailchimpCreateAudienceMeta: ActionMeta = {
  key: "mailchimp:create_audience",
  provider: "mailchimp",
  type: "create_audience",
  displayName: "Create Audience",
  description:
    "Create a new Mailchimp audience (list) via `POST /lists`. **Mailchimp requires compliance fields** (`permission_reminder`, `contact` mailing address, `campaign_defaults`) up front — V2 mirrors them as required and edits both objects as plain labeled fields.",
  category: "marketing",
  requiresIntegration: true,
  fields: [
    {
      name: "name",
      label: "Audience name",
      description: "Display name for the new audience. Required.",
      type: "text",
      required: true,
      placeholder: "Acme Newsletter",
    },
    {
      name: "permission_reminder",
      label: "Permission reminder",
      description:
        "Required by Mailchimp's anti-spam policy. Shown to subscribers in every campaign explaining how they joined the list (e.g. \"You're receiving this because you signed up at acme.com\").",
      type: "textarea",
      required: true,
      placeholder: "You're receiving this email because you signed up at acme.com.",
    },
    {
      name: "email_type_option",
      label: "Allow subscribers to pick email format",
      description:
        "Required. When `true`, Mailchimp lets each subscriber choose plain-text vs HTML email format. When `false`, the campaign default applies to everyone.",
      type: "boolean",
      required: true,
    },
    {
      name: "contact",
      label: "Mailing address",
      description:
        "Your organization's mailing address — shown in the footer of every email, as required by anti-spam law.",
      type: "object",
      required: true,
      itemFields: [
        {
          name: "company",
          label: "Company / organization",
          type: "text",
          required: true,
          placeholder: "Acme Inc.",
        },
        {
          name: "address1",
          label: "Address line 1",
          type: "text",
          required: true,
          placeholder: "123 Main St",
        },
        {
          name: "address2",
          label: "Address line 2",
          type: "text",
          required: false,
          placeholder: "Suite 400",
        },
        {
          name: "city",
          label: "City",
          type: "text",
          required: true,
          placeholder: "San Francisco",
        },
        {
          name: "state",
          label: "State / region",
          type: "text",
          required: true,
          placeholder: "CA",
        },
        {
          name: "zip",
          label: "ZIP / postal code",
          type: "text",
          required: true,
          placeholder: "94102",
        },
        {
          name: "country",
          label: "Country",
          type: "text",
          required: true,
          placeholder: "US",
        },
        {
          name: "phone",
          label: "Phone",
          type: "text",
          required: false,
        },
      ],
    },
    {
      name: "campaign_defaults",
      label: "Default sender",
      description:
        "The name and email address campaigns to this audience are sent from. Use an email on a domain you've verified in Mailchimp.",
      type: "object",
      required: true,
      itemFields: [
        {
          name: "from_name",
          label: "From name",
          type: "text",
          required: true,
          placeholder: "Acme Team",
        },
        {
          name: "from_email",
          label: "From email",
          type: "text",
          required: true,
          placeholder: "newsletter@acme.com",
        },
        {
          name: "subject",
          label: "Default subject",
          type: "text",
          required: false,
        },
        {
          name: "language",
          label: "Language",
          type: "text",
          required: false,
          placeholder: "en",
        },
      ],
    },
    {
      name: "use_archive_bar",
      label: "Use archive bar",
      description: "Optional. When `true`, Mailchimp displays an archive-bar at the top of every campaign sent to this audience.",
      type: "boolean",
      required: false,
      advanced: true,
    },
    {
      name: "notify_on_subscribe",
      label: "Notify on subscribe (email)",
      description: "Optional. Mailchimp emails this address when someone subscribes to the audience.",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "ops@acme.com",
    },
    {
      name: "notify_on_unsubscribe",
      label: "Notify on unsubscribe (email)",
      description: "Optional. Mailchimp emails this address when someone unsubscribes.",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "ops@acme.com",
    },
    {
      name: "marketing_permissions",
      label: "Enable GDPR marketing permissions",
      description: "Optional. When `true`, Mailchimp exposes the GDPR marketing-permissions UI on signup forms.",
      type: "boolean",
      required: false,
      advanced: true,
    },
    {
      name: "double_optin",
      label: "Require double opt-in",
      description: "Optional. When `true`, new subscribers must confirm via Mailchimp's confirmation email. Recommended for GDPR-strict use cases.",
      type: "boolean",
      required: false,
      advanced: true,
    },
  ],
  outputs: [
    {
      name: "audienceId",
      type: "string",
      description: "Mailchimp audience id (new list).",
    },
    {
      name: "name",
      type: "string",
      description: "Echoed audience name. Marked sensitive — workflow authors may name audiences with customer-identifying business data.",
      sensitive: true,
    },
    {
      name: "webId",
      type: "number",
      description: "Mailchimp web id (used in the dashboard URL). `null` when Mailchimp omits it.",
    },
    {
      name: "dateCreated",
      type: "string",
      description: "Mailchimp audience creation timestamp (ISO-8601). `null` when omitted.",
    },
    {
      name: "memberCount",
      type: "number",
      description: "Current member count (`0` for a freshly-created audience).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new Mailchimp audience. Compliance fields (mailing address, permission reminder) are required by Mailchimp — V2 surfaces them up front.",
};
