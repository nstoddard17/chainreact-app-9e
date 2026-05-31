import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { basesList } from "@/integrations/airtable/api/basesList";
import {
  filterByLabel,
  mapAirtableOptionsError,
  requireAirtableIntegration,
} from "./_shared";

/**
 * `airtable:bases` options resolver — Slice 4.AIRTABLE-META-2.
 *
 * Account-scoped top-level picker (no deps). The cascade ROOT every
 * Airtable action + the `record_changed` trigger hang their `baseId`
 * off, and the parent of the `tables` resolver.
 *
 * **Why a resolver is required (not optional polish):** `baseId` is an
 * opaque `appXXXXXXXXXXXXXX` id a human cannot reasonably hand-type
 * (same rationale as Excel's `workbookId`). Without this picker the
 * Airtable builder is effectively unusable.
 *
 * Architecture (mirrors `microsoft-excel:workbooks`):
 *   - `requiresIntegration: true`; no `requiredDeps`.
 *   - Wrapper via `refreshAndRetry({provider:"airtable",
 *     providerAccountId: ctx.integration.providerAccountId})` so a stale
 *     (rotated) Airtable token triggers exactly one refresh + retry.
 *   - Source: `basesList` (GET /v0/meta/bases, existing
 *     `schema.bases:read` scope).
 *
 * Mapping (base → OptionItem):
 *   - `value`: base `id` (the opaque `appXXX` id handlers/trigger consume).
 *   - `label`: `name` when non-empty, else `id` (defensive fallback).
 *   - `description`: `permissionLevel` when present (e.g. "create" /
 *     "edit" / "read") — a safe, non-secret capability hint. Base NAMES
 *     are titles in the user's own Airtable account, not secrets; record
 *     data / field values are never read here.
 *
 * Ordering: **sorted by label (alphabetical)**. Airtable's
 * `/v0/meta/bases` order is a loose workspace/home order with no strong
 * meaning for a flat picker; alpha sort aids findability in accounts
 * with many bases. (Contrast the table/field/view resolvers, which
 * PRESERVE Airtable's schema order because it mirrors the Airtable UI.)
 *
 * `hasMore`: true when Airtable returns a pagination `offset` (more
 * bases exist beyond this single page).
 *
 * Error sanitization: `IntegrationActionRequiredError` /
 * `Unauthorized401Error` → `INTEGRATION_DISCONNECTED`; anything else →
 * `PROVIDER_ERROR` with a static message. Tokens / raw Airtable bodies /
 * request URLs never reach the browser.
 */
export const airtableBasesResolver: OptionsResolver = {
  source: "airtable:bases",
  provider: "airtable",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireAirtableIntegration(ctx);

    let response;
    try {
      response = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "airtable",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => basesList({ accessToken }),
      });
    } catch (err) {
      mapAirtableOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const base of response.bases) {
      if (typeof base.id !== "string" || base.id.length === 0) continue;
      const label =
        typeof base.name === "string" && base.name.length > 0
          ? base.name
          : base.id;
      items.push(
        base.permissionLevel
          ? { value: base.id, label, description: base.permissionLevel }
          : { value: base.id, label },
      );
    }

    const filtered = filterByLabel(items, ctx.q).sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    return {
      items: filtered,
      hasMore: response.offset !== undefined,
    };
  },
};
