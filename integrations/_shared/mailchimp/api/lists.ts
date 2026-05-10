import { mailchimpRequest } from "./_request";

/**
 * Mailchimp Marketing API v3 `lists` resource wrappers — Slice 14
 * Commit 3.
 *
 * In Mailchimp's data model, an "audience" IS a list — the UI uses
 * "audience" but the API path is `/lists`. V2 schema/action naming
 * uses "audience" to match the user-facing label; this wrapper
 * preserves the API-path name.
 *
 * Endpoints covered:
 *   - POST /lists     (listCreate — creates a new audience)
 *
 * **Compliance fields are required by Mailchimp**, NOT V2-imposed:
 *   - `permission_reminder` — anti-spam law text shown to subscribers
 *     in every campaign explaining how they joined the list.
 *   - `contact` (object with `company`, `address1`, `city`, `state`,
 *     `zip`, `country`) — physical mailing address required by
 *     CAN-SPAM Act § 5 (16 C.F.R. § 316.5).
 *   - `campaign_defaults` (object with `from_name`, `from_email`,
 *     `subject`, `language`) — Mailchimp requires the defaults
 *     up-front; the audience can't be created without them.
 *
 * V1 [`createAudience.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createAudience.ts)
 * has the same shape. V2 keeps every field explicit at the schema
 * layer — no silent defaults for legal-compliance fields.
 */

export interface MailchimpList {
  id: string;
  web_id?: number;
  name: string;
  date_created?: string;
  stats?: {
    member_count?: number;
  };
}

// ─── listCreate ─────────────────────────────────────────────────────────────

export interface ListCreateContact {
  company: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

export interface ListCreateCampaignDefaults {
  from_name: string;
  from_email: string;
  subject?: string;
  language?: string;
}

export interface ListCreateInput {
  accessToken: string;
  dc: string;
  name: string;
  permissionReminder: string;
  emailTypeOption: boolean;
  contact: ListCreateContact;
  campaignDefaults: ListCreateCampaignDefaults;
  /** Whether to use Archive bar in archives. Mailchimp default: true. */
  useArchiveBar?: boolean;
  /**
   * Notification email for subscribe/unsubscribe events on this list.
   * Optional; Mailchimp omits notifications if not set.
   */
  notifyOnSubscribe?: string;
  notifyOnUnsubscribe?: string;
  /** Mailchimp marketing-permissions toggle (GDPR). Default: false. */
  marketingPermissions?: boolean;
  /**
   * Double-opt-in default for new subscribers. Default: false (single
   * opt-in). Mailchimp recommends true for GDPR-strict use cases.
   */
  doubleOptin?: boolean;
}

export async function listCreate(
  input: ListCreateInput,
): Promise<MailchimpList> {
  const body: Record<string, unknown> = {
    name: input.name,
    permission_reminder: input.permissionReminder,
    email_type_option: input.emailTypeOption,
    contact: { ...input.contact },
    campaign_defaults: { ...input.campaignDefaults },
  };
  if (input.useArchiveBar !== undefined) body.use_archive_bar = input.useArchiveBar;
  if (input.notifyOnSubscribe !== undefined) {
    body.notify_on_subscribe = input.notifyOnSubscribe;
  }
  if (input.notifyOnUnsubscribe !== undefined) {
    body.notify_on_unsubscribe = input.notifyOnUnsubscribe;
  }
  if (input.marketingPermissions !== undefined) {
    body.marketing_permissions = input.marketingPermissions;
  }
  if (input.doubleOptin !== undefined) body.double_optin = input.doubleOptin;

  return mailchimpRequest<MailchimpList>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "POST",
    path: "/lists",
    body,
    resourceForNotFound: "audience (create)",
  });
}
