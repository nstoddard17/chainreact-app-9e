/**
 * @jest-environment node
 *
 * AI-PROVIDER-9 CS-9 — end-to-end certification of the ChainReact AI
 * provider THROUGH THE REAL ENGINE (the plan §8 "mock-gateway engine E2E",
 * harness precedent: truckBridgeFlagshipWalkthrough.test.ts).
 *
 *   native:manual.run   (trigger)
 *     → ai:analyze_document   (staged CSV via signed_url FileRef)
 *       → ai:transform_data   ({{analyze.rows}} → destination-action shape)
 *
 * ── What is REAL here ───────────────────────────────────────────────────────
 * The `WorkflowEngine`, its readiness + test-mode gates driven by the REAL
 * discovery registry, the REAL `resolveStrict` resolver, the REAL handler
 * registry and both REAL AI handlers, the REAL document parsing layer (the
 * actual papaparse run over the committed CSV fixture), the REAL
 * `executeAiAction` pipeline (registry → flag → tier → price → gate → route →
 * gateway client → strict validation → ledger), the REAL request builders and
 * response normalizers, the REAL extraction/transform validators, the REAL
 * destination derivation against the live action registry, and the REAL error
 * classification.
 *
 * ── What is mocked (and nothing else) ───────────────────────────────────────
 * The database (workflows / runs / billing collaborators with their own
 * suites), the AI credit gate + ai_cost_events recorder (DB I/O seams — their
 * internals have dedicated suites; here we assert exactly what reaches them),
 * and the NETWORK boundary: `global.fetch` serves the staged CSV bytes for the
 * signed-url FileRef and plays the gateway, capturing every request for the
 * privacy assertions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";

// ── DB: workflows + runs ────────────────────────────────────────────────────
const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));
jest.mock("@/repositories/workflowRuns", () => ({
  recordRun: async () => undefined,
  createWorkflowRunStart: async () => ({ created: true }),
  claimQueuedWorkflowRun: async () => ({ claimed: false }),
  finalizeWorkflowRun: async () => ({ finalized: true }),
  markWorkflowRunFailedBeforeExecution: async () => ({ updated: true }),
}));

// ── Orthogonal engine infrastructure (own suites) ───────────────────────────
jest.mock("@/services/billing/executionBillingGate", () => ({
  executionBillingGate: async () => ({ ok: true, used: 1, limit: 100 }),
}));
jest.mock("@/services/billing/advancedBranchingEntitlement", () => ({
  resolveAdvancedBranchingEntitlementServiceRole: async () => ({
    entitled: true, plan: "pro", planStatus: "active", fallback: false,
  }),
}));
jest.mock("@/services/billing/taskUsageRecorder", () => ({
  computeRunTaskUsage: () => ({ total: 1, byNode: {} }),
  recordRunActuals: async () => undefined,
}));
jest.mock("@/services/billing/reserveReconcileShadowMode", () => ({
  recordShadowComparison: async () => undefined,
}));
jest.mock("@/services/billing/billingShadowComparisons", () => ({
  recordBillingShadowComparison: async () => undefined,
}));
jest.mock("@/services/billing/reserveReconcileBilling", () => ({
  createBillingReservation: async () => ({ ok: true, reservationId: null }),
  reconcileBillingReservation: async () => undefined,
}));
jest.mock("@/services/billing/workflowCostEstimator", () => ({
  estimateWorkflowTaskCost: () => 1,
}));
jest.mock("@/repositories/accountBilling", () => ({
  reserveTasks: jest.fn(), reconcileReservation: jest.fn(), releaseReservation: jest.fn(),
  releaseExpiredReservations: jest.fn(), deductTasks: jest.fn(), getUsage: jest.fn(),
}));
jest.mock("@/services/notifications/notifyWorkflowFailure", () => ({
  notifyWorkflowFailure: async () => ({ claimed: true, results: [] }),
}));
jest.mock("@/services/integrations/connectionResolution", () => ({
  buildWorkflowCredentialPlan: async () => ({ byNode: {} }),
}));
jest.mock("@/services/workflows/activeRevision", () => ({
  getDefinitionForExecution: async (wf: { draftDefinition: unknown }) => ({
    definition: wf.draftDefinition, source: "draft", revisionId: null,
  }),
}));

// ── AI billing seams (DB I/O; internals covered by their own suites) ────────
const gateCalls: Array<Record<string, unknown>> = [];
jest.mock("@/services/billing/aiCreditGate", () => ({
  aiCreditGate: async (input: {
    feature: string;
    testMode?: boolean;
  }) => {
    gateCalls.push({ ...input });
    if (input.testMode === true) {
      return { ok: true, skipped: true, reason: "test_mode" };
    }
    const CHARGES: Record<string, number> = {
      document_analysis: 3,
      data_transform: 2,
      schema_suggestion: 1,
    };
    return { ok: true, charged: CHARGES[input.feature] ?? 5, used: 10, limit: 100 };
  },
}));
const ledgerCompleted: Array<Record<string, unknown>> = [];
const ledgerFailed: Array<Record<string, unknown>> = [];
jest.mock("@/services/billing/aiCostEvents", () => ({
  recordAiModelCallCompleted: async (
    scope: Record<string, unknown>,
    details: Record<string, unknown>,
  ) => {
    ledgerCompleted.push({ ...scope, ...details });
  },
  recordAiModelCallFailed: async (
    scope: Record<string, unknown>,
    details: Record<string, unknown>,
  ) => {
    ledgerFailed.push({ ...scope, ...details });
  },
}));

import { WorkflowEngine } from "@/services/execution/engine";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";
import { applyDynamicOutputs } from "@/core/workflows/dynamicOutputs";
import { resolveValueAtPath } from "@/core/workflows/resolveValueAtPath";
import { analyzeDocumentMeta } from "@/integrations/ai/actions/analyzeDocument.meta";

// ── Fixtures ────────────────────────────────────────────────────────────────

const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const GATEWAY_URL = "https://ai-gateway.example.test";
const GATEWAY_TOKEN = "gw-secret-token-cs9";
const CSV_URL = "https://files.example.test/signed/payroll.csv";

const CSV_BYTES = readFileSync(
  join(__dirname, "../../../fixtures/documents/sample.csv"),
);

const triggerEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "run-1",
  occurredAt: "2026-07-24T00:00:00Z",
  providerAccountId: "native",
  payload: { inputs: {} },
};

const ROW_SCHEMA = {
  fields: [
    { name: "employee_name", type: "string", required: true },
    { name: "overtime_hours", type: "number" },
  ],
};

function node(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}
function edge(id: string, from: string, to: string): WorkflowEdge {
  return { id, from, to };
}

function analyzeConfig(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    file: { kind: "signed_url", url: CSV_URL, name: "payroll.csv", mimeType: "text/csv" },
    mode: "extract_rows",
    rowSchema: ROW_SCHEMA,
    ...over,
  };
}

function seedWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
  mockGetWorkflow.mockResolvedValue({
    id: "wf-ai-cert",
    accountId: ACCOUNT,
    createdByUserId: USER,
    name: "AI certification",
    state: "active",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: { nodes, edges },
    deletedAt: null,
    createdAt: "2026-07-24T00:00:00Z",
    updatedAt: "2026-07-24T00:00:00Z",
  });
}

// ── The network boundary ────────────────────────────────────────────────────

interface CapturedGatewayCall {
  url: string;
  headers: Record<string, string>;
  bodyText: string;
  body: Record<string, unknown>;
}
const gatewayCalls: CapturedGatewayCall[] = [];
let gatewayOverride: ((body: Record<string, unknown>) => Response) | null = null;

/** Canonical per-task success payloads (the CS-2 fixture shapes). */
function gatewaySuccessFor(body: Record<string, unknown>): Record<string, unknown> {
  const task = body.task as string;
  if (task === "analyze_document") {
    switch (body.mode as string) {
      case "extract_rows":
        return {
          ok: true,
          result: {
            rows: [
              { employee_name: "Alice Johnson", overtime_hours: "2", _confidence: 0.95 },
              { employee_name: "Carol Diaz", overtime_hours: 6, _confidence: 0.9 },
            ],
            overallConfidence: 0.9,
          },
          usage: { prompt_tokens: 2100, completion_tokens: 140, total_tokens: 2240 },
          modelTag: "hermes-doc-v1",
        };
      case "extract_fields":
        return {
          ok: true,
          result: {
            fields: {
              employee_name: { value: "Alice Johnson", confidence: 0.97 },
              overtime_hours: { value: "2", confidence: 0.9 },
            },
            overallConfidence: 0.93,
          },
          modelTag: "hermes-doc-v1",
        };
      case "summarize":
        return {
          ok: true,
          result: {
            summary: "Staff roster with roles and notes for three employees.",
            keyPoints: ["Alice Johnson drives", "Carol Diaz is a mechanic"],
            overallConfidence: 0.92,
          },
          modelTag: "hermes-doc-v1",
        };
      case "classify":
        return {
          ok: true,
          result: { label: "roster", confidence: 0.88 },
          modelTag: "hermes-doc-v1",
        };
      case "answer_questions":
        return {
          ok: true,
          result: { answer: "Three people are listed.", confidence: 0.9 },
          modelTag: "hermes-doc-v1",
        };
      default:
        throw new Error(`unexpected mode ${String(body.mode)}`);
    }
  }
  if (task === "transform_data") {
    if (body.outputShape === "record") {
      // Keys match the microsoft-outlook:send_email derived schema.
      return {
        ok: true,
        result: {
          record: {
            subject: "June overtime summary",
            body: "Alice Johnson: 2h; Carol Diaz: 6h.",
            isHtml: "no",
            importance: "normal",
          },
          overallConfidence: 0.9,
        },
        modelTag: "hermes-doc-v1",
      };
    }
    return {
      ok: true,
      result: {
        rows: [
          { subject: "Alice Johnson overtime", body: "2 hours", isHtml: "no", importance: "normal", _confidence: 0.9 },
        ],
        overallConfidence: 0.9,
      },
      modelTag: "hermes-doc-v1",
    };
  }
  throw new Error(`unexpected task ${String(task)}`);
}

beforeEach(() => {
  gatewayCalls.length = 0;
  gateCalls.length = 0;
  ledgerCompleted.length = 0;
  ledgerFailed.length = 0;
  gatewayOverride = null;
  mockGetWorkflow.mockReset();

  process.env.AI_PROCESSOR_ENABLED = "true";
  process.env.AI_PROCESSOR_PROVIDER = "gateway";
  process.env.CHAINREACT_AI_GATEWAY_URL = GATEWAY_URL;
  process.env.CHAINREACT_AI_GATEWAY_TOKEN = GATEWAY_TOKEN;

  global.fetch = jest.fn(async (
    input: string | URL,
    init?: { body?: unknown; headers?: Record<string, string> },
  ) => {
    const url = String(input);
    if (url === CSV_URL) {
      return new Response(new Uint8Array(CSV_BYTES), {
        status: 200,
        headers: { "content-type": "text/csv" },
      });
    }
    if (url.startsWith(GATEWAY_URL)) {
      const bodyText = String(init?.body ?? "");
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      gatewayCalls.push({
        url,
        headers: Object.fromEntries(
          Object.entries((init?.headers ?? {}) as Record<string, string>),
        ),
        bodyText,
        body,
      });
      if (gatewayOverride) return gatewayOverride(body);
      return new Response(JSON.stringify(gatewaySuccessFor(body)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;
});

afterAll(() => {
  delete process.env.AI_PROCESSOR_ENABLED;
  delete process.env.AI_PROCESSOR_PROVIDER;
  delete process.env.CHAINREACT_AI_GATEWAY_URL;
  delete process.env.CHAINREACT_AI_GATEWAY_TOKEN;
});

function engine(): WorkflowEngine {
  return new WorkflowEngine({ resolveStrict });
}

async function run(testMode = false) {
  return engine().runWorkflow({
    workflowId: "wf-ai-cert",
    triggerNodeId: "t1",
    triggerEvent,
    testMode,
    triggeredBy: "manual",
    triggeredByUserId: USER,
  });
}

function stepOutput(
  result: { steps: readonly { nodeId: string; output?: unknown }[] },
  nodeId: string,
): Record<string, unknown> {
  const step = result.steps.find((s) => s.nodeId === nodeId);
  expect(step).toBeDefined();
  return step!.output as Record<string, unknown>;
}

// ── The flagship chain ──────────────────────────────────────────────────────

describe("AI provider engine certification — the full chain", () => {
  const chainNodes = [
    node("t1", "trigger", "native", "manual.run"),
    node("analyze", "action", "ai", "analyze_document", analyzeConfig()),
    node("transform", "action", "ai", "transform_data", {
      input: "{{analyze.rows}}",
      destinationMode: "action",
      destinationAction: "microsoft-outlook:send_email",
      outputShape: "record",
    }),
  ];
  const chainEdges = [edge("e1", "t1", "analyze"), edge("e2", "analyze", "transform")];

  it("CSV → parse → extract rows → {{analyze.rows}} → destination-action transform → bounded outputs", async () => {
    seedWorkflow(chainNodes, chainEdges);
    const result = await run();
    expect(result.status).toBe("succeeded");

    // Analyze: real parser read the staged CSV; validator coerced "2" → 2.
    const analyzeOut = stepOutput(result, "analyze");
    expect(analyzeOut.mode).toBe("extract_rows");
    expect(analyzeOut.detectedType).toBe("csv");
    expect(analyzeOut.rowCount).toBe(2);
    expect(analyzeOut.rows).toEqual([
      { employee_name: "Alice Johnson", overtime_hours: 2, _confidence: 0.95 },
      { employee_name: "Carol Diaz", overtime_hours: 6, _confidence: 0.9 },
    ]);
    // Bounded fixed key set — irrelevant keys explicit null, never missing.
    expect(analyzeOut.summary).toBeNull();
    expect(analyzeOut.label).toBeNull();
    expect(analyzeOut.answer).toBeNull();

    // Variable propagation: the single-template {{analyze.rows}} reached the
    // transform as the RAW array (inputCount = 2 items).
    const transformOut = stepOutput(result, "transform");
    expect(transformOut.inputCount).toBe(2);
    expect(transformOut.destination).toBe("microsoft-outlook:send_email");
    // Record keys are the destination action's own field names; isHtml
    // coerced "no" → false by the real transform validator.
    expect(transformOut.record).toEqual({
      subject: "June overtime summary",
      body: "Alice Johnson: 2h; Carol Diaz: 6h.",
      isHtml: false,
      importance: "normal",
    });
    expect(transformOut.rows).toBeNull();

    // The transform gateway request carried the derived destination context
    // (advisory richness) and the actual serialized input rows.
    const transformCall = gatewayCalls.find((c) => c.body.task === "transform_data")!;
    const destCtx = transformCall.body.destinationContext as {
      action: { key: string };
      fields: { name: string }[];
    };
    expect(destCtx.action.key).toBe("microsoft-outlook:send_email");
    expect(destCtx.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(["subject", "body", "isHtml", "importance"]),
    );
  });

  it("CS-8 bridge: every variable path the builder advertises exists in the real run output", async () => {
    seedWorkflow(chainNodes, chainEdges);
    const result = await run();
    const analyzeOut = stepOutput(result, "analyze");

    const synthesized = applyDynamicOutputs(analyzeDocumentMeta, analyzeConfig());
    const rowChildren = synthesized.find((o) => o.name === "rows")!.fields!;
    expect(rowChildren.map((c) => c.name)).toEqual(["employee_name", "overtime_hours"]);
    for (const child of rowChildren) {
      const resolved = resolveValueAtPath(analyzeOut, `rows[0].${child.name}`);
      expect(resolved.found).toBe(true);
    }
  });

  it("bills both steps through the real pipeline: gate order, features, tiers, sanitized ledger", async () => {
    seedWorkflow(chainNodes, chainEdges);
    await run();

    expect(gateCalls.map((g) => [g.feature, g.plannedTier])).toEqual([
      ["document_analysis", "fast"],
      ["data_transform", "fast"],
    ]);
    expect(ledgerFailed).toHaveLength(0);
    expect(ledgerCompleted).toHaveLength(2);

    const analyzeRow = ledgerCompleted[0]!;
    expect(analyzeRow.feature).toBe("document_analysis");
    expect(analyzeRow.accountId).toBe(ACCOUNT);
    expect(analyzeRow.userId).toBe(USER);
    expect(analyzeRow.workflowId).toBe("wf-ai-cert");
    expect(analyzeRow.workflowRunId).toEqual(expect.any(String));
    expect(analyzeRow.aiCreditsCharged).toBe(3);
    expect(analyzeRow.modelName).toBe("hermes-doc-v1");
    const transformRow = ledgerCompleted[1]!;
    expect(transformRow.feature).toBe("data_transform");
    expect(transformRow.aiCreditsCharged).toBe(2);

    // No document content, extracted values, or config text in any ledger row.
    const serialized = JSON.stringify(ledgerCompleted);
    for (const leaked of ["Alice Johnson", "Carol Diaz", "overtime", "payroll.csv", CSV_URL]) {
      expect(serialized).not.toContain(leaked);
    }
    // Metadata is counts/enums only.
    const meta = (analyzeRow.metadata ?? {}) as Record<string, unknown>;
    expect(meta.task).toBe("analyze_document");
    expect(meta.mode).toBe("extract_rows");
    expect(meta.tier).toBe("fast");
    expect(meta.estimatedCredits).toBe(3);
  });

  it("privacy: gateway bodies carry no ids/token; token rides ONLY the Authorization header", async () => {
    seedWorkflow(chainNodes, chainEdges);
    await run();
    expect(gatewayCalls.length).toBe(2);
    for (const call of gatewayCalls) {
      expect(call.headers.Authorization ?? call.headers.authorization).toBe(
        `Bearer ${GATEWAY_TOKEN}`,
      );
      expect(call.bodyText).not.toContain(GATEWAY_TOKEN);
      expect(call.bodyText).not.toContain(ACCOUNT);
      expect(call.bodyText).not.toContain(USER);
      expect(call.bodyText).not.toContain("wf-ai-cert");
      expect(call.bodyText).not.toContain(CSV_URL); // name only, never the URL
      expect(call.body.requestId).toEqual(expect.stringMatching(/^aip-/));
    }
    // The DOCUMENT TEXT does cross (inherent to extraction, plan §6) — assert
    // it is the parsed fixture, i.e. what we claim crosses actually crosses.
    const analyzeCall = gatewayCalls.find((c) => c.body.task === "analyze_document")!;
    expect(analyzeCall.bodyText).toContain("Johnson, Alice");
  });

  it("test mode: real uncharged model call — gate skipped, ledger records 0 charged / 3 estimated", async () => {
    seedWorkflow(
      [chainNodes[0]!, chainNodes[1]!],
      [edge("e1", "t1", "analyze")],
    );
    const result = await run(true);
    expect(result.status).toBe("succeeded");
    expect(gatewayCalls.length).toBe(1); // the model call is REAL in test mode
    expect(gateCalls[0]!.testMode).toBe(true);
    expect(ledgerCompleted[0]!.aiCreditsCharged).toBe(0);
    expect(
      (ledgerCompleted[0]!.metadata as Record<string, unknown>).estimatedCredits,
    ).toBe(3);
    expect(
      (ledgerCompleted[0]!.metadata as Record<string, unknown>).testMode,
    ).toBe(true);
  });
});

// ── Every remaining Analyze mode + custom transform ─────────────────────────

describe("AI provider engine certification — mode matrix", () => {
  function analyzeOnly(config: Record<string, unknown>) {
    seedWorkflow(
      [node("t1", "trigger", "native", "manual.run"), node("analyze", "action", "ai", "analyze_document", config)],
      [edge("e1", "t1", "analyze")],
    );
  }

  it("summarize", async () => {
    analyzeOnly(analyzeConfig({ mode: "summarize", rowSchema: undefined }));
    const result = await run();
    expect(result.status).toBe("succeeded");
    const out = stepOutput(result, "analyze");
    expect(out.summary).toContain("roster");
    expect(Array.isArray(out.keyPoints)).toBe(true);
    expect(out.rows).toBeNull();
    expect(out.fields).toBeNull();
  });

  it("extract_fields (values coerced to the author's types)", async () => {
    analyzeOnly(
      analyzeConfig({
        mode: "extract_fields",
        rowSchema: undefined,
        expectedFields: ROW_SCHEMA,
      }),
    );
    const result = await run();
    expect(result.status).toBe("succeeded");
    const out = stepOutput(result, "analyze");
    expect(out.fields).toEqual({ employee_name: "Alice Johnson", overtime_hours: 2 });
    expect(out.rows).toBeNull();
  });

  it("classify", async () => {
    analyzeOnly(
      analyzeConfig({ mode: "classify", rowSchema: undefined, labels: ["roster", "invoice"] }),
    );
    const result = await run();
    expect(result.status).toBe("succeeded");
    const out = stepOutput(result, "analyze");
    expect(out.label).toBe("roster");
    expect(out.summary).toBeNull();
  });

  it("answer_questions", async () => {
    analyzeOnly(
      analyzeConfig({
        mode: "answer_questions",
        rowSchema: undefined,
        question: "How many people are listed?",
      }),
    );
    const result = await run();
    expect(result.status).toBe("succeeded");
    const out = stepOutput(result, "analyze");
    expect(out.answer).toContain("Three");
    expect(out.label).toBeNull();
  });

  it("transform_data custom-schema mode: output keys are the author's schema names", async () => {
    seedWorkflow(
      [
        node("t1", "trigger", "native", "manual.run"),
        node("analyze", "action", "ai", "analyze_document", analyzeConfig()),
        node("transform", "action", "ai", "transform_data", {
          input: "{{analyze.rows}}",
          destinationMode: "custom",
          destinationSchema: {
            fields: [
              { name: "subject", type: "string", required: true },
              { name: "body", type: "string" },
              { name: "isHtml", type: "boolean" },
              { name: "importance", type: "string" },
            ],
          },
          outputShape: "record",
        }),
      ],
      [edge("e1", "t1", "analyze"), edge("e2", "analyze", "transform")],
    );
    const result = await run();
    expect(result.status).toBe("succeeded");
    const out = stepOutput(result, "transform");
    expect(out.destination).toBeNull();
    expect(Object.keys(out.record as Record<string, unknown>).sort()).toEqual(
      ["body", "importance", "isHtml", "subject"],
    );
  });
});

// ── Flag + failure certification ────────────────────────────────────────────

describe("AI provider engine certification — flags and failures", () => {
  function analyzeOnly() {
    seedWorkflow(
      [node("t1", "trigger", "native", "manual.run"), node("analyze", "action", "ai", "analyze_document", analyzeConfig())],
      [edge("e1", "t1", "analyze")],
    );
  }

  it("AI_PROCESSOR_ENABLED off → step fails safely BEFORE any gate call or network I/O", async () => {
    delete process.env.AI_PROCESSOR_ENABLED;
    analyzeOnly();
    const result = await run();
    expect(result.status).toBe("failed");
    const step = result.steps.find((s) => s.nodeId === "analyze")!;
    expect(step.status).toBe("failed");
    expect(step.error?.code).toBe("HANDLER_FAILED");
    expect(gateCalls).toHaveLength(0);
    expect(gatewayCalls).toHaveLength(0);
    // Safe message — no env var names leaked to run history is not required,
    // but no document content ever is.
    expect(JSON.stringify(result)).not.toContain("Johnson");
  });

  it("credits exhausted → AI_CREDITS_EXHAUSTED, no model call, no charge", async () => {
    analyzeOnly();
    const realGateModule = jest.requireMock("@/services/billing/aiCreditGate") as {
      aiCreditGate: (i: Record<string, unknown>) => Promise<unknown>;
    };
    const original = realGateModule.aiCreditGate;
    realGateModule.aiCreditGate = async () => ({
      ok: false,
      reason: "insufficient_ai_credits",
      required: 3,
      balance: 0,
    });
    try {
      const result = await run();
      expect(result.status).toBe("failed");
      const step = result.steps.find((s) => s.nodeId === "analyze")!;
      expect(step.error?.code).toBe("AI_CREDITS_EXHAUSTED");
      expect(gatewayCalls).toHaveLength(0);
      expect(ledgerCompleted).toHaveLength(0);
    } finally {
      realGateModule.aiCreditGate = original;
    }
  });

  it("gateway 429 → TRANSIENT_PROVIDER_ERROR with a failed ledger row (RATE_LIMITED, retryable)", async () => {
    analyzeOnly();
    gatewayOverride = () =>
      new Response(JSON.stringify({ ok: false, error: "RATE_LIMITED" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    const result = await run();
    expect(result.status).toBe("failed");
    const step = result.steps.find((s) => s.nodeId === "analyze")!;
    expect(step.error?.code).toBe("TRANSIENT_PROVIDER_ERROR");
    expect(ledgerFailed).toHaveLength(1);
    const meta = ledgerFailed[0]!.metadata as Record<string, unknown>;
    expect(meta.failureCode).toBe("RATE_LIMITED");
    expect(meta.retryable).toBe(true);
  });

  it("unreadable document (image-only PDF posture) → fails BEFORE the gate: zero spend", async () => {
    seedWorkflow(
      [
        node("t1", "trigger", "native", "manual.run"),
        node("analyze", "action", "ai", "analyze_document", analyzeConfig({
          file: { kind: "provider_url", url: "https://provider.example/file", provider: "slack", name: "f.pdf" },
        })),
      ],
      [edge("e1", "t1", "analyze")],
    );
    const result = await run();
    expect(result.status).toBe("failed");
    expect(gateCalls).toHaveLength(0);
    expect(gatewayCalls).toHaveLength(0);
    const step = result.steps.find((s) => s.nodeId === "analyze")!;
    expect(step.error?.code).toBe("HANDLER_FAILED");
  });
});
