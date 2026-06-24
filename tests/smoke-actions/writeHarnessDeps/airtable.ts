/**
 * Write smoke harness deps — Airtable discovery + read-back seams.
 *
 * Extracted from writeHarnessDeps.ts (structure-only split; behavior unchanged).
 * Every provider read runs through `refreshAndRetry` (Airtable OAuth tokens are
 * short-lived — see seam-refresh-guard.test.ts / the SMOKE-WRITE-11 bug).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { recordsList } from "@/integrations/airtable/api/records";
import { basesGetSchema } from "@/integrations/airtable/api/bases";
import { pickAirtableAttachmentField, pickAirtablePrimaryTextField } from "../writeTargets";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

/**
 * Discover the primary text field NAME of the smoke Airtable table so record
 * writes can stamp the marker into it without hardcoding a base's schema. READ-ONLY
 * (meta schema GET). Returns the field name (env-overlay for SMOKE_AIRTABLE_TEXT_FIELD)
 * or null when the table has no writable text field -> caller reports BLOCKED_ENV.
 */
export async function discoverAirtableSmokeTextField(
  accountId: string,
  userId: string,
  baseId: string,
  tableId: string,
): Promise<string | null> {
  const integration = await getActiveForExecution(accountId, "airtable", null, {
    connectedByUserId: userId,
  });
  if (!integration) return null;
  let schema;
  try {
    // refreshAndRetry mirrors the real handler path: Airtable OAuth tokens are
    // short-lived, so a raw call against a stale token 401s. The engine refreshes;
    // discovery MUST too, or it falsely reports BLOCKED_ENV on a healthy connection.
    schema = await refreshAndRetry({
      accountId,
      provider: "airtable",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => basesGetSchema({ accessToken, baseId, includeViews: false }),
    });
  } catch {
    return null; // missing schema scope / base gone -> BLOCKED_ENV, never a guess
  }
  const table = schema.tables.find((t) => t.id === tableId || t.name === tableId);
  if (!table) return null;
  return pickAirtablePrimaryTextField({
    id: table.id,
    primaryFieldId: table.primaryFieldId,
    fields: table.fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
  });
}

/**
 * Discover the NAME of an attachment field on the smoke table (for `add_attachment`)
 * via the read-only schema (refresh-safe). Returns the first `multipleAttachments`
 * field, or null when the table has none -> caller reports BLOCKED_ENV (set
 * SMOKE_AIRTABLE_ATTACHMENT_FIELD). Never returns a non-attachment field. READ-ONLY.
 */
export async function discoverAirtableSmokeAttachmentField(
  accountId: string,
  userId: string,
  baseId: string,
  tableId: string,
): Promise<string | null> {
  const integration = await getActiveForExecution(accountId, "airtable", null, {
    connectedByUserId: userId,
  });
  if (!integration) return null;
  let schema;
  try {
    schema = await refreshAndRetry({
      accountId,
      provider: "airtable",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => basesGetSchema({ accessToken, baseId, includeViews: false }),
    });
  } catch {
    return null;
  }
  const table = schema.tables.find((t) => t.id === tableId || t.name === tableId);
  if (!table) return null;
  return pickAirtableAttachmentField({
    id: table.id,
    primaryFieldId: table.primaryFieldId,
    fields: table.fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
  });
}

/**
 * Smoke read-back: `airtable:record` — existence + persisted `fields` probe used by
 * the create/update/delete record fixtures. Returns null for any other (provider,
 * action). See context.ts for the reader contract.
 */
export async function airtableSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "airtable" || input.action !== "record") return null;
  const integration = await getActiveForExecution(ctx.accountId, "airtable", null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) return { ok: false, output: null, reason: "airtable not connected" };
  const { baseId, tableIdOrName, recordId } = input.config;
  if (
    typeof baseId !== "string" ||
    typeof tableIdOrName !== "string" ||
    typeof recordId !== "string" ||
    !baseId || !tableIdOrName || !recordId
  ) {
    return { ok: false, output: null, reason: "record read-back: missing baseId/tableIdOrName/recordId" };
  }
  // Existence probe via recordsList + RECORD_ID() (NOT get-by-id): Airtable
  // returns a CONFLATED 403 "invalid permissions, or the requested model was
  // not found" for a deleted record, indistinguishable from a real access
  // loss — so get-by-id cannot prove deletion. recordsList instead SUCCEEDS
  // when the token/base/table are accessible (proving access) and returns the
  // record only if it still exists. Absence => genuinely deleted; a thrown
  // error => a real access problem (propagates -> honest VERIFY_FAILED, never
  // a false "deleted"). refreshAndRetry handles the short-lived Airtable token.
  const list = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "airtable",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      recordsList({
        accessToken,
        baseId,
        tableIdOrName,
        filterByFormula: `RECORD_ID()='${recordId}'`,
        maxRecords: 1,
      }),
  });
  // Return the found record's `fields` too so a verify can confirm the
  // marker on the PROVIDER-persisted record (independent of the write echo).
  // `fields` is {} when absent — a deleted record's `exists:false` probe
  // (single delete_record fixture) is unaffected.
  const found = list.records.find((r) => r.id === recordId);
  return { ok: true, output: { exists: !!found, fields: found?.fields ?? {} }, reason: null };
}
