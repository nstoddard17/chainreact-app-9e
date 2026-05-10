import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  contactsCreate,
  contactsUpdate,
  findContactByEmail,
  type HubSpotContact,
} from "../../_shared/hubspot/api/contacts";
import { ConflictError } from "../../_shared/hubspot/errors";
import { CreateContactConfigSchema } from "./createContact.schema";

/**
 * HubSpot `create_contact` action handler — Slice 13 Batch 1.
 *
 * POSTs `/crm/v3/objects/contacts` with the user's decrypted bearer
 * access token. Wraps the principal call in `refreshAndRetry` so
 * 401s trigger the standard refresh-then-retry flow.
 *
 * Duplicate handling (V2 fix for V1's brittle regex bug):
 *   V1 [`hubspot.ts:182`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L182)
 *   parses the existing contact id out of HubSpot's 409 error message
 *   with `/Existing ID: (\d+)/`. The error-message text is not part of
 *   HubSpot's contract — small message changes break duplicate
 *   recovery.
 *
 *   V2 replaces this with a deterministic flow: on 409, call
 *   `findContactByEmail` (HubSpot's `objects/contacts/search` endpoint
 *   with `email EQ` filter), then PATCH or return based on the
 *   workflow author's chosen strategy.
 *
 *   - `'fail'` (default): re-throw the ConflictError with the original
 *     HubSpot error body. No search, no PATCH.
 *   - `'update'`: search-by-email → if found, PATCH with the new
 *     properties → return the updated contact. If search returns null
 *     (race condition: contact deleted between 409 and search),
 *     re-throw the original ConflictError.
 *   - `'skip'`: search-by-email → return the existing contact
 *     unchanged. Same race-condition behavior as `update`.
 *
 * Output shape:
 *   { contactId, email, firstName, lastName, createdAt, updatedAt,
 *     wasUpdate (true if update path ran), wasSkip (true if skip path
 *     ran), properties }
 *
 *   Stable across all three duplicate-handling strategies — workflows
 *   downstream of `create_contact` can branch on `wasUpdate` / `wasSkip`
 *   to know whether the action mutated state.
 */
export const createContact: ActionHandler = async (input) => {
  const config = CreateContactConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  // Build properties map — only include non-empty fields.
  const properties: Record<string, string> = { email: config.email };
  for (const k of [
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

  let wasUpdate = false;
  let wasSkip = false;
  let contact: HubSpotContact;

  try {
    contact = await refreshAndRetry({
      userId: input.userId,
      provider: "hubspot",
      accountId,
      apiCall: (accessToken) =>
        contactsCreate({ accessToken, properties }),
    });
  } catch (err) {
    if (!(err instanceof ConflictError) || config.duplicateHandling === "fail") {
      throw err;
    }
    // 409 with `update` or `skip` strategy — deterministic recovery.
    const existing = await refreshAndRetry({
      userId: input.userId,
      provider: "hubspot",
      accountId,
      apiCall: (accessToken) =>
        findContactByEmail({ accessToken, email: config.email }),
    });
    if (!existing) {
      // Race: contact existed at 409-time but is gone now. Surface the
      // original conflict so the user sees the canonical error rather
      // than a confusing "search returned null."
      throw err;
    }
    if (config.duplicateHandling === "skip") {
      contact = existing;
      wasSkip = true;
    } else {
      // update
      contact = await refreshAndRetry({
        userId: input.userId,
        provider: "hubspot",
        accountId,
        apiCall: (accessToken) =>
          contactsUpdate({
            accessToken,
            contactId: existing.id,
            properties,
          }),
      });
      wasUpdate = true;
    }
  }

  return {
    output: {
      contactId: contact.id,
      email: contact.properties.email ?? config.email,
      firstName: contact.properties.firstname ?? null,
      lastName: contact.properties.lastname ?? null,
      createdAt: contact.createdAt ?? null,
      updatedAt: contact.updatedAt ?? null,
      wasUpdate,
      wasSkip,
      properties: contact.properties,
    },
  };
};
