/**
 * Typed client for the Builder AI routes (Slice 4.AI-11).
 *
 * Per project-structure-and-module-boundaries.md §4/§5: client code calls this
 * module, never the server services or `fetch()` from a component. These types
 * are CLIENT-OWNED views of the (already-sanitized) route responses — the client
 * may not import the `@/services/**` result types, and shouldn't: it renders a
 * value-free subset and treats `proposedPatch` as OPAQUE (it forwards it to the
 * apply route, never inspects or renders its config).
 *
 *   - POST /api/workflows/[id]/ai/plan  → preview-only plan (AI-9A).
 *   - POST /api/workflows/[id]/ai/apply → confirmed apply (AI-9B).
 *
 * Both routes return a STRUCTURED result body (with an `ok` boolean) for handled
 * outcomes — including the non-2xx "handled failure" statuses (plan: 503/502;
 * apply: 428/409/400-with-code). This client returns those structured bodies as
 * results; it only THROWS `AiApiError` for transport-level failures whose body
 * has no `ok` (401 / 404 / 500 / bad-request validation).
 */

/** Opaque to the client — produced by the plan route, forwarded to apply. */
export type AiOpaquePatch = Record<string, unknown>;

export class AiApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AiApiError";
    this.status = status;
  }
}

/**
 * Slice 4.AI-22 — optional server-enriched metadata so the React Agent
 * can render an interactive control per missing field (dropdown / async
 * picker / text fallback). All fields are optional; the existing
 * `label` + `kind` + `nodeId` + `field` consumers from AI-11 → AI-21C
 * still work unchanged.
 *
 * No-leak: these fields carry only display labels, FieldType enums,
 * static option `{label, value}` pairs declared in metadata, and the
 * `optionsSource` registry key (e.g. `slack:channels`). Live resolver
 * results, secrets, tokens, and raw config are never embedded here.
 */
export interface AiRequiredUserInput {
  readonly label: string;
  readonly nodeId?: string;
  readonly field?: string;
  readonly kind: string;
  /**
   * Slice 4.AI-35 — for `provider_choice` entries, the ambiguous capability
   * category (`"email"` | `"calendar"` | `"drive"` | `"chat"`). Lets the
   * control label itself + the follow-up cite the choice ("The email provider
   * is Gmail."). Absent for other entries.
   */
  readonly category?: string;
  /** Provider id (e.g. `slack`) — derived server-side from the patch's node metadata. */
  readonly provider?: string;
  /** Node type within the provider (e.g. `send_channel_message`). */
  readonly nodeType?: string;
  /** Human-readable node display name. */
  readonly nodeLabel?: string;
  /** Human-readable field label. */
  readonly fieldLabel?: string;
  /** FieldMeta renderer type — `text` / `select` / `combobox` / `textarea` / etc. */
  readonly fieldType?: string;
  /** Multi-select toggle (forwarded from FieldMeta.multiple). */
  readonly multiple?: boolean;
  /** Static-enum options. Mutually exclusive with `optionsSource`. */
  readonly options?: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  /** Dynamic options resolver key, e.g. `slack:channels`. */
  readonly optionsSource?: string;
  /** dependsOn parent field names for the optionsSource resolver. */
  readonly dependsOn?: ReadonlyArray<string>;
  /** Whether the user can type a free-text value instead of picking. */
  readonly allowFreeText?: boolean;
  /** FieldMeta placeholder — UX hint only. */
  readonly placeholder?: string;
}

export interface AiModelMeta {
  readonly modelId: string;
  readonly tier: string;
  readonly feature: string;
  readonly finishReason?: string;
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
  readonly latencyMs?: number;
}

/** Value-free description of one proposed change (from AI-5; never config values). */
export interface AiChangeSummary {
  readonly op: string;
  readonly description: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
}

export interface AiPreviewValidationIssue {
  readonly code: string;
  readonly message: string;
}

/** Why a change is risky (from AI-3, recomputed deterministically; value-free). */
export interface AiRiskReason {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
}

/** The subset of the AI-5 preview the Builder renders. Extra fields are ignored. */
export interface AiPreview {
  readonly ok: boolean;
  readonly riskLevel: string;
  readonly requiresConfirmation: boolean;
  readonly riskReasons?: readonly AiRiskReason[];
  readonly affectedNodeIds?: readonly string[];
  readonly affectedEdgeIds?: readonly string[];
  readonly changes?: readonly AiChangeSummary[];
  readonly validation?: {
    readonly ok: boolean;
    readonly errors: readonly AiPreviewValidationIssue[];
    readonly warnings: readonly AiPreviewValidationIssue[];
  };
  readonly taskCostEstimate?: { readonly estimatedTasksPerRun: number };
  readonly userFacingSummaryText?: string;
  readonly currentRevision?: string;
  readonly blockedReason?: string;
}

export interface AiPlanSuccess {
  readonly ok: true;
  readonly intentSummary: string;
  readonly assumptions: readonly string[];
  readonly requiredUserInput: readonly AiRequiredUserInput[];
  readonly unsupportedRequests: readonly string[];
  readonly safetyNotes: readonly string[];
  readonly proposedPatch?: AiOpaquePatch;
  readonly preview?: AiPreview;
  readonly canApplyLater: boolean;
  readonly blockedReason?: string;
  readonly model: AiModelMeta;
}

export interface AiPlanFailure {
  readonly ok: false;
  /** MODEL_FAILED | PARSE_FAILED | PREVIEW_UNAVAILABLE */
  readonly code: string;
  readonly message: string;
  readonly model?: AiModelMeta;
  readonly errors: readonly { readonly stage: string; readonly code: string; readonly message: string }[];
}

export type AiPlanResult = AiPlanSuccess | AiPlanFailure;

export interface AiApplyConfirmation {
  readonly confirmed: boolean;
  readonly acceptedRiskLevel?: string;
  readonly acceptedAt?: string;
}

export interface AiApplySuccess {
  readonly ok: true;
  readonly workflowId: string;
  readonly appliedPatchId: string;
  readonly appliedOperationCount: number;
  readonly riskLevel: string;
  readonly requiresConfirmation: boolean;
  readonly updatedAt: string;
  readonly summaryText: string;
}

export interface AiApplyFailure {
  readonly ok: false;
  /** CONFIRMATION_REQUIRED | STALE_PATCH | PATCH_INVALID | VALIDATION_FAILED | UNSUPPORTED_OPERATION | UPDATE_FAILED | NOT_FOUND */
  readonly code: string;
  readonly message: string;
  readonly errors?: readonly AiPreviewValidationIssue[];
}

export type AiApplyResult = AiApplySuccess | AiApplyFailure;

/**
 * Slice 4.AI-24 — value-free snapshot of the user's current builder canvas
 * (pending / unsaved). Sent with every plan request so the planner sees
 * what the user has RIGHT NOW (the server-saved `draftDefinition` may
 * lag — e.g. user deleted nodes locally without saving). Deliberately
 * minimal: provider:type pairs + edges only. NO config, NO position, NO
 * secrets.
 */
export interface CurrentGraphSnapshot {
  readonly nodes: ReadonlyArray<{
    readonly id: string;
    readonly kind: "trigger" | "action";
    readonly provider: string;
    readonly type: string;
  }>;
  readonly edges: ReadonlyArray<{
    readonly id: string;
    readonly from: string;
    readonly to: string;
  }>;
}

export interface PlanWorkflowRequest {
  readonly prompt: string;
  readonly modelTier?: "fast" | "strong";
  /** Slice 4.AI-24 — current builder-canvas snapshot. See {@link CurrentGraphSnapshot}. */
  readonly currentGraph?: CurrentGraphSnapshot;
}

export interface ApplyWorkflowPatchRequest {
  readonly patch: AiOpaquePatch;
  readonly confirmation?: AiApplyConfirmation;
}

function hasOkFlag(body: unknown): body is { ok: boolean } {
  return typeof body === "object" && body !== null && typeof (body as { ok?: unknown }).ok === "boolean";
}

/**
 * POST a structured-result AI request. Returns the parsed body when it carries
 * an `ok` flag (handled outcome, any status); throws `AiApiError` otherwise.
 */
async function postStructured<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (hasOkFlag(parsed)) return parsed as T;
  const message =
    (parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string"
      ? (parsed as { error: string }).error
      : null) ?? `AI request failed (HTTP ${res.status}).`;
  throw new AiApiError(message, res.status);
}

export async function planWorkflow(
  workflowId: string,
  request: PlanWorkflowRequest,
): Promise<AiPlanResult> {
  return postStructured<AiPlanResult>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/plan`,
    request,
  );
}

export async function applyWorkflowPatch(
  workflowId: string,
  request: ApplyWorkflowPatchRequest,
): Promise<AiApplyResult> {
  return postStructured<AiApplyResult>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/apply`,
    request,
  );
}

/**
 * Slice 4.AI-23 — persistent Builder Agent thread / workflow-scoped chat
 * history. The React Agent rail loads its prior conversation through
 * `getBuilderAgentThread(workflowId)`, appends each chat-rendered message
 * via `appendBuilderAgentMessage(...)`, and clears the thread on the
 * panel's "Clear conversation" / "Plan another change" handler via
 * `clearBuilderAgentThread(...)`.
 *
 * Persistence is INTENTIONALLY a separate surface from `planWorkflow` /
 * `applyWorkflowPatch` — the plan/apply routes never persist on their own
 * (the AI-11/AI-21 invariant). This client/server pair is the only place
 * Builder Agent chat history is written.
 *
 * The persisted-message shape mirrors the sanitized projection the server
 * stores: `role` + `kind` + optional `content` + an allowlisted
 * `safePayload` projection of the AI route result. NEVER include
 * `proposedPatch`, raw model output, raw configs, secrets, or tokens —
 * the server sanitizer drops them, but the client should avoid even
 * sending them.
 */

export type BuilderAgentMessageRole = "user" | "assistant";

export type BuilderAgentMessageKind =
  | "prompt"
  | "followup"
  | "plan_result"
  | "needs_input"
  | "applied"
  | "apply_failure"
  | "error"
  | "system_notice";

export interface BuilderAgentPersistedMessage {
  readonly id: string;
  readonly role: BuilderAgentMessageRole;
  readonly kind: BuilderAgentMessageKind;
  readonly content: string | null;
  readonly safePayload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface BuilderAgentThreadSummary {
  readonly id: string;
  readonly workflowId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BuilderAgentThreadResponse {
  readonly thread: BuilderAgentThreadSummary;
  readonly messages: readonly BuilderAgentPersistedMessage[];
}

export interface AppendBuilderAgentMessageInput {
  readonly role: BuilderAgentMessageRole;
  readonly kind: BuilderAgentMessageKind;
  readonly content?: string | null;
  readonly safePayload?: Readonly<Record<string, unknown>> | null;
}

// Type-only alias for the `init` argument of `fetch()`. Inferring from
// `typeof fetch` avoids referencing the DOM `RequestInit` typename, which
// the eslint `no-undef` rule flags even in type position.
type FetchInit = Parameters<typeof fetch>[1];

async function fetchJson<T>(url: string, init?: FetchInit): Promise<T> {
  const res = await fetch(url, init);
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : null) ?? `Request failed (HTTP ${res.status}).`;
    throw new AiApiError(message, res.status);
  }
  return parsed as T;
}

export async function getBuilderAgentThread(
  workflowId: string,
): Promise<BuilderAgentThreadResponse> {
  return fetchJson<BuilderAgentThreadResponse>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/thread`,
    { method: "GET" },
  );
}

export async function appendBuilderAgentMessage(
  workflowId: string,
  input: AppendBuilderAgentMessageInput,
): Promise<BuilderAgentPersistedMessage> {
  const res = await fetchJson<{ readonly message: BuilderAgentPersistedMessage }>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/thread/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return res.message;
}

export async function clearBuilderAgentThread(
  workflowId: string,
): Promise<{ readonly ok: boolean; readonly deletedCount: number }> {
  return fetchJson<{ ok: boolean; deletedCount: number }>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/thread`,
    { method: "DELETE" },
  );
}

/**
 * AI-13 failed-run repair (POST /api/workflows/[id]/runs/[runId]/ai/repair).
 *
 * Client-side view of the AI-7 service's `RepairSuggestionResult`. Like
 * `proposedPatch` on the plan response, the repair patch is treated as OPAQUE
 * by the client — the Builder forwards it verbatim to the existing apply route
 * (`applyWorkflowPatch`) on confirmation, never inspects its config.
 *
 * Fields here mirror the route response (value-free recommendations + a
 * preview's structural summary). Extra fields the server adds in the future
 * are tolerated.
 */
export interface AiRepairFailureSummary {
  readonly failed: boolean;
  readonly status: "succeeded" | "failed";
  readonly isTest: boolean;
  readonly failedNodeId: string | null;
  readonly errorCode: string | null;
  readonly classification: {
    readonly title: string;
    readonly description: string;
    readonly hint?: string;
    readonly action?: "reconnect" | "open_node" | "upgrade_plan";
    readonly severity: "warning" | "error";
  } | null;
}

export type AiRepairability = "repairable" | "needsUserInput" | "noSafeRepair";

export interface AiRepairRequiredUserInput {
  readonly nodeId: string;
  readonly field?: string;
  readonly label: string;
  readonly kind: "config_value" | "select_integration" | "choose_trigger" | "variable_reference";
}

export interface AiRepairSuccess {
  readonly ok: true;
  readonly workflowId: string;
  readonly workflowRunId: string;
  readonly failureSummary: AiRepairFailureSummary;
  readonly repairability: AiRepairability;
  /** Categorical reason (e.g. MISSING_REQUIRED_FIELD, DISCONNECTED_INTEGRATION). */
  readonly reasonCode: string;
  /** Opaque to the client — forwarded to `applyWorkflowPatch` on confirm. */
  readonly proposedPatch?: AiOpaquePatch;
  readonly preview?: AiPreview;
  readonly requiredUserInput: readonly AiRepairRequiredUserInput[];
  readonly recommendations: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly safetyNotes: readonly string[];
}

export interface AiRepairFailure {
  readonly ok: false;
  /** NOT_FOUND | READ_FAILED — surface error shape from the service. */
  readonly code: string;
  readonly message: string;
}

export type AiRepairResult = AiRepairSuccess | AiRepairFailure;

/** Forward-compat: empty body is accepted; fields below are ignored at AI-13. */
export interface RequestWorkflowRepairRequest {
  readonly repairPrompt?: string;
  readonly modelTier?: "fast" | "strong";
  readonly selectedNodeId?: string;
}

export async function requestWorkflowRepair(
  workflowId: string,
  runId: string,
  request: RequestWorkflowRepairRequest = {},
): Promise<AiRepairResult> {
  return postStructured<AiRepairResult>(
    `/api/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/ai/repair`,
    request,
  );
}
