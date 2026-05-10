import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { contactsUpdate } from "../../_shared/hubspot/api/contacts";
import { UpdateContactConfigSchema } from "./updateContact.schema";

/**
 * HubSpot `update_contact` action handler — Slice 13 Batch 1.
 *
 * PATCHes `/crm/v3/objects/contacts/{id}` with the provided property
 * fields. Drops empty / nullable / undefined values at the wrapper
 * boundary — only non-empty strings are sent to HubSpot.
 *
 * Throws at the schema layer if `contactId` is empty. Throws at the
 * handler layer if no property fields are provided (HubSpot's PATCH
 * with an empty body succeeds but is a no-op — explicit failure here
 * surfaces misconfigured workflows at design time).
 */
export const updateContact: ActionHandler = async (input) => {
  const config = UpdateContactConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties: Record<string, string> = {};
  for (const k of [
    "email",
    "firstname",
    "lastname",
    "phone",
    "company",
    "jobtitle",
    "website",
    "lifecyclestage",
    "hs_lead_status",
    "address",
    "city",
    "state",
    "zip",
    "country",
  ] as const) {
    const v = config[k];
    if (typeof v === "string" && v.length > 0) {
      properties[k] = v;
    }
  }
  if (Object.keys(properties).length === 0) {
    throw new Error(
      "hubspot update_contact: at least one property field must be provided.",
    );
  }

  const contact = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      contactsUpdate({
        accessToken,
        contactId: config.contactId,
        properties,
      }),
  });

  return {
    output: {
      contactId: contact.id,
      email: contact.properties.email ?? null,
      firstName: contact.properties.firstname ?? null,
      lastName: contact.properties.lastname ?? null,
      updatedAt: contact.updatedAt ?? null,
      properties: contact.properties,
    },
  };
};
