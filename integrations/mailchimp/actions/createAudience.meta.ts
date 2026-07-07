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
 * `contact` and `campaign_defaults` are nested objects; the builder
 * surface exposes them as `textarea` paste-JSON fields per the
 * accepted plan (D-MC strategy — `keyvalue` doesn't handle nested
 * objects, and a dedicated nested-form UI is a future slice). The
 * field descriptions list the required keys verbatim so authors know
 * what JSON shape to paste.
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
    "Create a new Mailchimp audience (list) via `POST /lists`. **Mailchimp requires compliance fields** (`permission_reminder`, `contact` mailing address, `campaign_defaults`) up front — V2 mirrors them as required. Nested `contact` and `campaign_defaults` are paste-JSON until a dedicated nested-form UI lands.",
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
      label: "Contact (physical address)",
      description:
        "Your organization's mailing address, required by anti-spam law (CAN-SPAM). Enter as a JSON object with `company`, `address1`, `city`, `state`, `zip`, `country` (all required) plus optional `address2` and `phone` — or insert a value from a previous step. A structured address form is coming; this is currently a developer-style field.",
      type: "json",
      required: true,
      advanced: true,
      jsonShape: "object",
      placeholder: '{"company":"Acme","address1":"123 Main St","city":"SF","state":"CA","zip":"94102","country":"US"}',
    },
    {
      name: "campaign_defaults",
      label: "Campaign defaults",
      description:
        "Default sender details for campaigns to this audience, required by Mailchimp. Enter as a JSON object with `from_name` and `from_email` (both required) plus optional `subject` and `language` — or insert a value from a previous step. A structured form is coming; this is currently a developer-style field.",
      type: "json",
      required: true,
      advanced: true,
      jsonShape: "object",
      placeholder: '{"from_name":"Acme Team","from_email":"newsletter@acme.com"}',
    },
    {
      name: "use_archive_bar",
      label: "Use archive bar",
      description: "Optional. When `true`, Mailchimp displays an archive-bar at the top of every campaign sent to this audience.",
      type: "boolean",
      required: false,
    },
    {
      name: "notify_on_subscribe",
      label: "Notify on subscribe (email)",
      description: "Optional. Mailchimp emails this address when someone subscribes to the audience.",
      type: "text",
      required: false,
      placeholder: "ops@acme.com",
    },
    {
      name: "notify_on_unsubscribe",
      label: "Notify on unsubscribe (email)",
      description: "Optional. Mailchimp emails this address when someone unsubscribes.",
      type: "text",
      required: false,
      placeholder: "ops@acme.com",
    },
    {
      name: "marketing_permissions",
      label: "Enable GDPR marketing permissions",
      description: "Optional. When `true`, Mailchimp exposes the GDPR marketing-permissions UI on signup forms.",
      type: "boolean",
      required: false,
    },
    {
      name: "double_optin",
      label: "Require double opt-in",
      description: "Optional. When `true`, new subscribers must confirm via Mailchimp's confirmation email. Recommended for GDPR-strict use cases.",
      type: "boolean",
      required: false,
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
