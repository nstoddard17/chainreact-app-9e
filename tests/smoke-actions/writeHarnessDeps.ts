/**
 * Write smoke harness — REAL runActionStep dep (server-only test helper).
 *
 * Wires `WriteHarnessDeps.runActionStep` to the real V2 engine: each phase step
 * (setup / execute / verify / cleanup) runs as its OWN minimal
 * `{native:manual.run -> action}` workflow through the SAME enqueueRun path the
 * run-now route uses, in engine REAL mode, then the per-node output is read back
 * so the orchestrator can capture the created resource id.
 *
 * Why one workflow PER step (not one multi-node workflow): the write orchestrator
 * needs cleanup to run even when execute/verify failed (a finally-style teardown).
 * A single multi-node workflow would stop at the failed node and never reach
 * cleanup. Running each step independently preserves that guarantee and keeps the
 * ledger the single source of truth for what to clean up.
 *
 * SAFETY:
 *   - REAL mode (testMode=false) — this DOES call the provider. The caller gates
 *     it behind the write + destructive opt-ins (runWriteSmoke + the dev test).
 *   - Each step consumes one task from the smoke account's balance.
 *   - Node output stays in memory (returned to the pure orchestrator, which reads
 *     ONLY the captured id path into the ledger). It is never logged or surfaced
 *     in a report. Failure reasons are humanized titles / engine codes, sanitized.
 *   - Temp workflows are soft-deleted (state='deleted', named `smoke:write:`).
 *
 * Imported ONLY by the gated dev integration test; never by app/server/CLI.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/manualTrigger";
import { enqueueRun } from "@/services/execution/enqueue";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";
import { getOptionsResolver } from "@/services/options/_registry";
import { cardsGet, cardsListComments } from "@/integrations/trello/api/cards";
import { recordsList } from "@/integrations/airtable/api/records";
import { basesGetSchema } from "@/integrations/airtable/api/bases";
import { filesGetMetadata } from "@/integrations/_shared/dropbox/api/filesGetMetadata";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { NotFoundError as DropboxNotFoundError } from "@/integrations/_shared/dropbox/errors";
import { driveItemsGet } from "@/integrations/microsoft-onedrive/api/driveItemsGet";
import { NotFoundError as GraphNotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { WORKFLOW_FILES_BUCKET } from "@/core/files/fetchFileBytes";
import { search as notionSearch, type SearchHit } from "@/integrations/notion/api/search";
import { sanitizeFailureReason } from "@/scripts/chainreact/smoke/core";
import { SMOKE_ACTION_NODE_ID, SMOKE_TRIGGER_NODE_ID } from "./workflowRun";
import type { StepRunOutcome, WriteHarnessDeps } from "./writeHarness";
import {
  pickAirtableAttachmentField,
  pickAirtablePrimaryTextField,
  pickNotionSmokeDatabase,
  pickSecondSmokeList,
  pickSmokeSafeTarget,
  type ChosenNotionDatabase,
  type ChosenTrelloSecondList,
  type ChosenTrelloTarget,
  type NotionDatabaseHitLite,
  type TrelloListCandidate,
  type TrelloMoveListCandidate,
} from "./writeTargets";

export interface RealWriteHarnessDepsConfig {
  /** A service-role Supabase client (the dev test constructs it). */
  readonly supabase: SupabaseClient;
  /** Account that owns the temp smoke workflows + runs (and the provider creds). */
  readonly accountId: string;
  /** Provenance user (created_by_user_id + triggered_by_user_id). */
  readonly userId: string;
  /** Crypto-random uuid generator (node:crypto.randomUUID in the test). */
  readonly newUuid: () => string;
}

function buildSingleActionDefinition(
  provider: string,
  action: string,
  config: Readonly<Record<string, unknown>>,
): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: MANUAL_TRIGGER_PROVIDER,
        type: MANUAL_TRIGGER_EVENT_TYPE,
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider,
        type: action,
        config,
        position: { x: 0, y: 160 },
      },
    ],
    edges: [{ id: "smoke-edge", from: SMOKE_TRIGGER_NODE_ID, to: SMOKE_ACTION_NODE_ID }],
  });
}

/**
 * Provider connection facts for a write pilot — the 4-way classification inputs.
 * `dbConnected` = any active row on the account. `execUsable` = whether execution
 * can resolve the credential under the smoke user:
 *   - PERSONAL-class providers (trello, airtable, gmail, …) execute AS the
 *     workflow creator, so the smoke user must be the connector
 *     (`connected_by_user_id`); a co-member's row is connected-but-not-executable.
 *   - ACCOUNT-class providers (notion, slack, stripe, …) are account-shared, so
 *     execution does NOT filter by connector — `execUsable === dbConnected`.
 * Never collapses "no smoke target" into "not connected".
 */
export async function probeWriteConnection(
  accountId: string,
  userId: string,
  provider: string,
): Promise<{ dbConnected: boolean; execUsable: boolean }> {
  const dbConnected = (await getActiveForExecution(accountId, provider, null)) !== null;
  const execUsable = isPersonalCredentialProvider(provider)
    ? (await getActiveForExecution(accountId, provider, null, { connectedByUserId: userId })) !== null
    : dbConnected;
  return { dbConnected, execUsable };
}

/** @deprecated prefer probeWriteConnection — kept for the existing dev test. */
export async function isProviderConnectedForWrite(
  accountId: string,
  provider: string,
): Promise<boolean> {
  return (await getActiveForExecution(accountId, provider, null)) !== null;
}

/**
 * Discover an EXPLICITLY smoke-safe Trello list (a board AND list both named for
 * smoke/test use) via the read-only board/list option resolvers, then the pure
 * `pickSmokeSafeTarget`. READ-ONLY (only list resolvers run — never a mutation).
 * Returns the chosen target (id + safe LABELS) or null. The list id is for the
 * env overlay only; only labels are safe to log.
 */
export async function discoverTrelloSmokeTarget(
  accountId: string,
  userId: string,
): Promise<ChosenTrelloTarget | null> {
  const integration = await getActiveForExecution(accountId, "trello", null, {
    connectedByUserId: userId,
  });
  if (!integration) return null;
  const boardsR = getOptionsResolver("trello:boards");
  const listsR = getOptionsResolver("trello:lists");
  if (!boardsR || !listsR) return null;

  const boards = await boardsR.resolve({ userId, integration, q: "", deps: {} });
  const candidates: TrelloListCandidate[] = [];
  for (const b of boards.items) {
    const boardLabel = b.label ?? "";
    // Only descend into boards that already look smoke-safe (read-only, bounded).
    if (!/smoke|test|chainreact/i.test(boardLabel)) continue;
    const lists = await listsR.resolve({ userId, integration, q: "", deps: { boardId: b.value } });
    for (const l of lists.items) {
      candidates.push({ boardId: b.value, boardLabel, listId: l.value, listLabel: l.label ?? "" });
    }
  }
  return pickSmokeSafeTarget(candidates);
}

/**
 * Discover a safe SECOND Trello list (a MOVE destination for `move_card`) on the
 * SAME smoke board as the source list, via the read-only `trello:lists` resolver +
 * the pure `pickSecondSmokeList`. Lists ONLY on the explicitly smoke/test-named
 * source board are considered (the caller already proved the board is smoke-safe),
 * the source list is excluded, and the destination name must match the move-target
 * allow-list. Returns the chosen list (id + safe label) or null -> the caller
 * reports BLOCKED_ENV and asks for SMOKE_TRELLO_TARGET_LIST_ID. READ-ONLY.
 */
export async function discoverTrelloSecondSmokeList(
  accountId: string,
  userId: string,
  sourceBoardId: string,
  sourceListId: string,
): Promise<ChosenTrelloSecondList | null> {
  const integration = await getActiveForExecution(accountId, "trello", null, {
    connectedByUserId: userId,
  });
  if (!integration) return null;
  const listsR = getOptionsResolver("trello:lists");
  if (!listsR) return null;
  const lists = await listsR.resolve({ userId, integration, q: "", deps: { boardId: sourceBoardId } });
  const candidates: TrelloMoveListCandidate[] = lists.items.map((l) => ({
    listId: l.value,
    listLabel: l.label ?? "",
  }));
  return pickSecondSmokeList(candidates, sourceListId);
}

/**
 * Discover a Trello label id on a smoke board for `add_label_to_card` via the
 * read-only `trello:labels` resolver. Trello boards ship 6 default color labels,
 * so this resolves on any board. Returns the first label's id (env-overlay only)
 * + a safe label for the report, or null when the board has no labels. READ-ONLY.
 */
export async function discoverTrelloSmokeLabel(
  accountId: string,
  userId: string,
  boardId: string,
): Promise<{ labelId: string; label: string } | null> {
  const integration = await getActiveForExecution(accountId, "trello", null, {
    connectedByUserId: userId,
  });
  if (!integration) return null;
  const labelsR = getOptionsResolver("trello:labels");
  if (!labelsR) return null;
  const labels = await labelsR.resolve({ userId, integration, q: "", deps: { boardId } });
  const chosen = labels.items[0];
  if (!chosen) return null;
  return { labelId: chosen.value, label: chosen.label ?? chosen.value };
}

/**
 * Discover a safe Notion PARENT page for `create_page` via the read-only
 * `notion:pages` resolver (POST /search, object=page). Prefers a smoke/test-named
 * page; on a THROWAWAY smoke account, falls back to the first accessible page
 * (creating a marked child page + archiving it is harmless there). Returns the
 * parent page id (env-overlay only) + its title for the report, or null.
 */
export async function discoverNotionSmokeParentPage(
  accountId: string,
  userId: string,
): Promise<{ pageId: string; title: string } | null> {
  const integration = await getActiveForExecution(accountId, "notion", null);
  if (!integration) return null;
  const pagesR = getOptionsResolver("notion:pages");
  if (!pagesR) return null;
  const pages = await pagesR.resolve({ userId, integration, q: "", deps: {} });
  if (pages.items.length === 0) return null;
  const named = pages.items.find((p) => /smoke|test|chainreact/i.test(p.label ?? ""));
  const chosen = named ?? pages.items[0]!;
  return { pageId: chosen.value, title: chosen.label ?? chosen.value };
}

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
 * Stage a tiny throwaway file in OUR `workflow-files` Supabase bucket so
 * `add_attachment` can attach it via a `v2_storage` FileRef (the handler mints a
 * short-lived signed URL Airtable fetches). This is the SELF-CONTAINED alternative
 * to a public/external URL — the bytes are our own controlled 1x1 PNG, never an
 * invented third-party URL. Returns the storagePath (for the FileRef) + a `remove`
 * cleanup. Uses the caller's service-role client (same one the dev test builds).
 */
const SMOKE_ATTACHMENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

export async function stageSmokeAttachmentFile(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ storagePath: string; remove: () => Promise<void> } | null> {
  const { error } = await supabase.storage
    .from(WORKFLOW_FILES_BUCKET)
    .upload(storagePath, SMOKE_ATTACHMENT_PNG, { contentType: "image/png", upsert: true });
  if (error) return null;
  return {
    storagePath,
    remove: async () => {
      await supabase.storage.from(WORKFLOW_FILES_BUCKET).remove([storagePath]).catch(() => {});
    },
  };
}

/**
 * Discover a safe smoke Notion DATABASE (+ its title-property name) for
 * `create_database_entry` via the read-only search API (object=database). When
 * `pinnedId` (SMOKE_NOTION_DATABASE_ID) is set, that exact database is used; else a
 * smoke/test-named DB is preferred, falling back to the first accessible DB on a
 * throwaway account. Returns the database id + title-field name (env-overlay only)
 * or null -> caller reports BLOCKED_ENV. READ-ONLY (POST /v1/search).
 */
export async function discoverNotionSmokeDatabase(
  accountId: string,
  userId: string,
  pinnedId?: string | null,
): Promise<ChosenNotionDatabase | null> {
  const integration = await getActiveForExecution(accountId, "notion", null);
  if (!integration) return null;
  let response;
  try {
    // refreshAndRetry mirrors the notion handlers + the notion:pages resolver.
    // Notion is non-refreshable today (tokens are long-lived) so this is a no-op
    // on success / surfaces a 401 on failure — but it keeps the seam on the SAME
    // path as every other Notion read, so a future Notion-refresh slice can't
    // silently leave this discovery raw (the Airtable SMOKE-WRITE-11 bug class).
    response = await refreshAndRetry({
      accountId,
      provider: "notion",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        notionSearch({
          accessToken,
          query: "",
          filter: { value: "database", property: "object" },
          pageSize: 100,
        }),
    });
  } catch {
    return null;
  }
  const hits: NotionDatabaseHitLite[] = response.results
    .filter((h) => h.object === "database")
    .map((h) => ({
      id: h.id,
      title: notionDatabaseTitle(h),
      titleFieldName: notionTitlePropertyName(h),
    }));
  return pickNotionSmokeDatabase(hits, pinnedId);
}

/** Plain-text title of a database search hit (rich-text array → string). */
function notionDatabaseTitle(hit: SearchHit): string {
  if (Array.isArray(hit.title)) {
    const text = hit.title.map((t) => t.plain_text ?? t.text?.content ?? "").join("").trim();
    if (text.length > 0) return text;
  }
  return hit.id;
}

/** The NAME of the title-type property in a database hit's schema, or null. */
function notionTitlePropertyName(hit: SearchHit): string | null {
  const props = hit.properties;
  if (props && typeof props === "object") {
    for (const [name, value] of Object.entries(props)) {
      if ((value as { type?: string })?.type === "title") return name;
    }
  }
  return null;
}

export function makeRealWriteHarnessDeps(
  config: RealWriteHarnessDepsConfig,
): WriteHarnessDeps {
  const { supabase, accountId, userId, newUuid } = config;

  return {
    async runActionStep(input): Promise<StepRunOutcome> {
      let definition: WorkflowDefinition;
      try {
        definition = buildSingleActionDefinition(input.provider, input.action, input.config);
      } catch (err) {
        return { ok: false, output: null, reason: sanitizeFailureReason((err as Error).message) };
      }

      // 1. Persist a throwaway draft workflow (manual.run registers no resources).
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          account_id: accountId,
          created_by_user_id: userId,
          name: `smoke:write:${input.provider}:${input.action}`,
          state: "draft",
          draft_definition: definition,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        return {
          ok: false,
          output: null,
          reason: sanitizeFailureReason(`createSmokeWorkflow failed: ${error?.message ?? "no row"}`),
        };
      }
      const workflowId = data.id;

      try {
        // 2. Run it LIVE (real provider call) via the run-now service path.
        const event: TriggerEvent = {
          provider: MANUAL_TRIGGER_PROVIDER,
          eventType: MANUAL_TRIGGER_EVENT_TYPE,
          eventId: newUuid(),
          occurredAt: new Date().toISOString(),
          providerAccountId: "system",
          payload: { inputs: {} },
        };
        let enginePromise: Promise<void> = Promise.resolve();
        const { runId } = await enqueueRun({
          workflowId,
          triggerNodeId: SMOKE_TRIGGER_NODE_ID,
          event,
          testMode: false,
          triggeredBy: "manual",
          triggeredByUserId: userId,
          executionDefinitionMode: "live",
          keepAlive: (p) => {
            enginePromise = p;
          },
        });
        await enginePromise;

        // 3. Read the persisted run + the action node's output.
        const rec = await workflowRunsRepo.getById(runId);
        if (!rec) return { ok: false, output: null, reason: "run did not reach a terminal state" };

        const step = rec.steps.find((s) => s.nodeId === SMOKE_ACTION_NODE_ID);
        const ok = rec.status === "succeeded" && step?.status === "succeeded";
        if (ok) {
          return { ok: true, output: step?.output ?? null, reason: null };
        }
        return {
          ok: false,
          output: null,
          // SAFE: humanized title or engine fatal-error CODE only, sanitized.
          reason: sanitizeFailureReason(
            rec.errorClassification?.title ?? rec.fatalError?.code ?? "step run failed",
          ),
        };
      } catch (err) {
        return { ok: false, output: null, reason: sanitizeFailureReason((err as Error).message) };
      } finally {
        // 4. Best-effort soft-delete of the temp workflow (never flips a verdict).
        const { error: delErr } = await supabase
          .from("workflows")
          .update({ state: "deleted", deleted_at: new Date().toISOString() })
          .eq("id", workflowId);
        if (delErr) {
          console.warn(
            JSON.stringify({ event: "smoke.write.cleanup_failed", workflowId, error: delErr.message }),
          );
        }
      }
    },

    // SMOKE-ONLY read-back: bounded, READ-ONLY provider calls used to verify a
    // marker where no user-facing read action exists. Never mutates; never goes
    // through the engine. Provider tokens are decrypted here exactly as the
    // builder option resolvers do.
    async smokeReadBack(input): Promise<StepRunOutcome> {
      try {
        if (input.provider === "trello" && input.action === "card_comments") {
          const integration = await getActiveForExecution(accountId, "trello", null, {
            connectedByUserId: userId,
          });
          if (!integration) return { ok: false, output: null, reason: "trello not connected" };
          const cardId = input.config.cardId;
          if (typeof cardId !== "string" || cardId.length === 0) {
            return { ok: false, output: null, reason: "card_comments read-back: missing cardId" };
          }
          // refreshAndRetry mirrors the Trello handlers + resolvers. Trello is
          // non-refreshable (long-lived tokens) so this is a no-op on success today,
          // but keeps every smoke read on the SAME refresh path as the handlers.
          const actions = await refreshAndRetry({
            accountId,
            provider: "trello",
            providerAccountId: integration.providerAccountId,
            apiCall: (accessToken) => cardsListComments({ accessToken, cardId, limit: 20 }),
          });
          // Bounded mapping — provider-confirmed comment text + ids only.
          const comments = actions.map((a) => ({
            commentId: a.id,
            text: a.data?.text ?? null,
            date: a.date ?? null,
          }));
          return { ok: true, output: { comments }, reason: null };
        }
        if (input.provider === "trello" && input.action === "card") {
          const integration = await getActiveForExecution(accountId, "trello", null, {
            connectedByUserId: userId,
          });
          if (!integration) return { ok: false, output: null, reason: "trello not connected" };
          const cardId = input.config.cardId;
          if (typeof cardId !== "string" || cardId.length === 0) {
            return { ok: false, output: null, reason: "card read-back: missing cardId" };
          }
          const card = await refreshAndRetry({
            accountId,
            provider: "trello",
            providerAccountId: integration.providerAccountId,
            apiCall: (accessToken) => cardsGet({ accessToken, cardId }),
          });
          // Bounded mapping — only the membership/state fields verification reads.
          return {
            ok: true,
            output: {
              cardId: card.id,
              name: card.name,
              idList: card.idList ?? null,
              idLabels: card.idLabels ?? [],
              idMembers: card.idMembers ?? [],
              closed: card.closed ?? false,
            },
            reason: null,
          };
        }
        if (input.provider === "airtable" && input.action === "record") {
          const integration = await getActiveForExecution(accountId, "airtable", null, {
            connectedByUserId: userId,
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
            accountId,
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
        if (input.provider === "dropbox" && input.action === "path_metadata") {
          const integration = await getActiveForExecution(accountId, "dropbox", null, {
            connectedByUserId: userId,
          });
          if (!integration) return { ok: false, output: null, reason: "dropbox not connected" };
          const path = input.config.path;
          if (typeof path !== "string" || path.length === 0) {
            return { ok: false, output: null, reason: "dropbox path_metadata read-back: missing path" };
          }
          // Existence probe for delete verification. get_metadata SUCCEEDS for a
          // live path; a DELETED (trashed) path surfaces a TYPED NotFoundError
          // (409 path/not_found) — distinct from a permission/other error, which
          // RE-THROWS to the outer catch -> ok:false -> honest VERIFY_FAILED, never
          // a false "deleted". refreshAndRetry mirrors the Dropbox handlers' path.
          try {
            const entry = await refreshAndRetry({
              accountId,
              provider: "dropbox",
              providerAccountId: integration.providerAccountId,
              apiCall: (accessToken) => filesGetMetadata({ accessToken, path }),
            });
            const n = normalizeDropboxEntry(entry);
            // Bounded, sanitized: only the existence flag + structural fields a
            // verify reads (name for the create-folder marker check, isFolder).
            return { ok: true, output: { exists: true, name: n.name, isFolder: n.isFolder }, reason: null };
          } catch (err) {
            if (err instanceof DropboxNotFoundError) {
              return { ok: true, output: { exists: false }, reason: null };
            }
            throw err;
          }
        }
        if (input.provider === "microsoft-onedrive" && input.action === "item_metadata") {
          const integration = await getActiveForExecution(accountId, "microsoft-onedrive", null, {
            connectedByUserId: userId,
          });
          if (!integration) return { ok: false, output: null, reason: "microsoft-onedrive not connected" };
          const itemId = input.config.itemId;
          if (typeof itemId !== "string" || itemId.length === 0) {
            return { ok: false, output: null, reason: "onedrive item_metadata read-back: missing itemId" };
          }
          // Existence probe for delete verification. GET /me/drive/items/{id}
          // SUCCEEDS for a live item; a DELETED item (in the recycle bin) returns
          // Graph 404 -> TYPED NotFoundError. Any other error RE-THROWS -> ok:false
          // -> honest VERIFY_FAILED. We created + own the item, so a 404 after our
          // own delete reliably means deleted (never a permission artifact).
          try {
            const item = await refreshAndRetry({
              accountId,
              provider: "microsoft-onedrive",
              providerAccountId: integration.providerAccountId,
              apiCall: (accessToken) => driveItemsGet({ accessToken, itemId }),
            });
            return {
              ok: true,
              output: { exists: true, name: item.name ?? "", kind: item.folder ? "folder" : "file" },
              reason: null,
            };
          } catch (err) {
            if (err instanceof GraphNotFoundError) {
              return { ok: true, output: { exists: false }, reason: null };
            }
            throw err;
          }
        }
        return { ok: false, output: null, reason: `no smoke reader for ${input.provider}:${input.action}` };
      } catch (err) {
        return { ok: false, output: null, reason: sanitizeFailureReason((err as Error).message) };
      }
    },
  };
}
