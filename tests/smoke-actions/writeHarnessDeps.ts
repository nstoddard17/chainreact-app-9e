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
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";
import { getOptionsResolver } from "@/services/options/_registry";
import { decryptToken } from "@/core/encryption/tokens";
import { cardsGet, cardsListComments } from "@/integrations/trello/api/cards";
import { sanitizeFailureReason } from "@/scripts/chainreact/smoke/core";
import { SMOKE_ACTION_NODE_ID, SMOKE_TRIGGER_NODE_ID } from "./workflowRun";
import type { StepRunOutcome, WriteHarnessDeps } from "./writeHarness";
import {
  pickSmokeSafeTarget,
  type ChosenTrelloTarget,
  type TrelloListCandidate,
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
          const accessToken = decryptToken(integration.accessTokenEncrypted);
          const actions = await cardsListComments({ accessToken, cardId, limit: 20 });
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
          const accessToken = decryptToken(integration.accessTokenEncrypted);
          const card = await cardsGet({ accessToken, cardId });
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
        return { ok: false, output: null, reason: `no smoke reader for ${input.provider}:${input.action}` };
      } catch (err) {
        return { ok: false, output: null, reason: sanitizeFailureReason((err as Error).message) };
      }
    },
  };
}
