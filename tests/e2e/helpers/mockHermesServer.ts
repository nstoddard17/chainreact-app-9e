import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

/**
 * 5.DUAL-BUILDER-1 CS-7F — deterministic local mock of the ChainReact AI Gateway
 * (the Hermes Agent boundary), for the real-browser Ask React acceptance journey.
 *
 * It implements ONLY the exact endpoint the production client calls
 * (`POST /api/hermes-agent/guidance`, `services/ai-guidance/gateway/hermesAgentGatewayClient.ts`)
 * plus a `/health` probe. Everything ELSE in the path stays real: the Document
 * Ask React control, the one Agent rail/composer, WorkflowGuidancePanel, the
 * account guidance route, response parsing (`normalizeGatewayResponse` +
 * `validateWorkflowPlan`), preview state, useBuilderPreview, checkpoint/change-
 * history, and graphSlice apply. Only the model RESPONSE is canned here.
 *
 * SAFETY: binds to 127.0.0.1 ONLY; CS-7G reserves a PER-RUN loopback port (see
 * `reservePort.ts`) rather than a fixed one, so two runs never share a mock server
 * and a stray process can't shadow it; passing `port: 0` binds an ephemeral port and
 * the handle reports the ACTUAL bound port. NEVER logs the prompt body, workflow
 * config, or the bearer token; records only bounded counts + the selected fixture
 * NAME. It selects a deterministic fixture from the user-goal line of the (already
 * de-identified) prompt — it does not echo or persist the prompt.
 */

export const MOCK_HERMES_DEFAULT_PORT = 9890;

/** Fixture kinds the mock can return. */
export type MockHermesFixture =
  | "additive"
  | "edit"
  | "destructive"
  | "branching"
  | "prose"
  | "unknown";

export interface MockHermesHandle {
  port: number;
  baseUrl: string;
  /** Bounded diagnostics — counts + last fixture NAME only. Never prompt/config/secrets. */
  readonly calls: { total: number; byFixture: Record<MockHermesFixture, number>; lastFixture: MockHermesFixture | null };
  close(): Promise<void>;
}

// CS-7G editable fixture (see tests/e2e/helpers/dualBuilderFixtures.ts):
//   node_1 Manual Trigger · node_2 Slack "notification" (editable `text`) ·
//   node_3 Slack "reminder" (channel unset → the Finish-Setup item) ·
//   node_4 Slack "follow-up" (fully configured, safely removable tail).
// Editable refs are assigned in ARRAY ORDER (node_{i+1}), so these refs are stable.
// The mock proposes EDIT-path mutation operations (a fenced ```json patch in the reply
// content) against those stable refs — the same shape the real gateway would return,
// parsed by the real `extractMutationOperationsFromText`, resolved by the real
// `resolveEditableGraphRefs` (NEW nodes MUST use the `new_` ref prefix), and validated
// by the real `proposeWorkflowMutation` against the live editable graph.

/** Wrap mutation operations in an OpenAI-style success envelope with a fenced patch.
 * The patch is a `{ operations: [...] }` object (the shape the real parser expects);
 * baseVersion is OMITTED so the route uses its own live snapshot version (non-stale). */
function mutationEnvelope(prose: string, ops: unknown[]): unknown {
  const content = `${prose}\n\n\`\`\`json\n${JSON.stringify({ operations: ops }, null, 2)}\n\`\`\``;
  return {
    ok: true,
    response: {
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    },
  };
}

/** ADDITIVE (NEW-workflow path): a capability-validated WorkflowPlan skeleton
 * (Manual Trigger → Slack message). The route turns this into a non-applied
 * previewDraft via the real planToDraftPreview; Apply builds it into the draft. */
function additiveEnvelope(): unknown {
  return {
    ok: true,
    response: {
      choices: [
        {
          message: {
            content:
              "Here's a workflow to build. Review it below — nothing in your workflow has changed yet.",
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    },
    // Envelope-sibling plan (strict). Trigger + one action; the action's required
    // fields stay unset so Finish Setup has work to do after Apply.
    plan: {
      title: "Manual run → Slack notification",
      steps: [
        { ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "Start on demand" },
        { ref: "s1", role: "action", provider: "slack", type: "send_channel_message", purpose: "Notify the team" },
      ],
    },
  };
}

/** EDIT: modify the notification message (node_2 `text`) AND add one new follow-up step.
 * The NEW node uses the `new_` ref prefix (else `resolveEditableGraphRefs` rejects it); the
 * addEdge appends it after the current tail (node_4) so the graph stays a valid linear chain. */
function editEnvelope(): unknown {
  return mutationEnvelope(
    "I'll update the notification message and add a follow-up step. Review the changes below.",
    [
      { op: "updateNodeConfig", nodeId: "node_2", config: { text: "Updated by React" } },
      {
        op: "addNode",
        node: { id: "new_recap", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 480 } },
      },
      { op: "addEdge", edge: { id: "new_recap_edge", from: "node_4", to: "new_recap" } },
    ],
  );
}

/** DESTRUCTIVE: remove the existing follow-up step (node_4 — the fully-configured tail with a
 * recipient `channel`, so the real apply-mode confirmation is required before it applies). */
function destructiveEnvelope(): unknown {
  return mutationEnvelope(
    "I'll remove the follow-up step. Review this destructive change below.",
    [{ op: "removeNode", nodeId: "node_4" }],
  );
}

/** BRANCHING: a NEW-workflow If/Then plan (advanced branching). Used to prove the Free
 * entitlement gate drops it (upgrade text, no preview) while Pro would see the proposal. */
function branchingEnvelope(): unknown {
  return {
    ok: true,
    response: {
      choices: [
        {
          message: {
            content:
              "Here's a workflow that branches on the amount. Review it below — nothing has changed yet.",
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    },
    plan: {
      title: "Branch on amount over 1000",
      steps: [
        { ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "Start on demand" },
        { ref: "s1", role: "action", provider: "native", type: "if_then_condition", purpose: "Check whether the amount is above 1000" },
        { ref: "s2", role: "action", provider: "native", type: "format_transformer", purpose: "Handle the high-value path" },
      ],
    },
  };
}

/** Prose-only reply (no plan) — the safe default for an unrecognized prompt. */
function proseEnvelope(): unknown {
  return {
    ok: true,
    response: {
      choices: [{ message: { content: "I can help with that. Tell me a bit more about the step you want." } }],
    },
  };
}

/** Pick a deterministic fixture from keywords in the de-identified prompt. */
export function selectFixture(prompt: string): MockHermesFixture {
  // Match ONLY the user's goal line — the surrounding system prompt (capability
  // catalog, "removeEdge/replaceEdge" edit instructions, etc.) contains keywords
  // that would otherwise mis-route every request. Ordering matters: the most
  // specific/destructive markers are tested FIRST so an ambiguous phrase can never
  // fall through to a destructive fixture.
  const m = prompt.match(/User goal \(their words\):\s*(.+)/i);
  const goal = (m ? m[1]! : prompt).toLowerCase();
  // Advanced branching — an explicit "split/branch based on ... above/over N" ask.
  if (/\bsplit\b|\bbranch\b|\bif\/then\b|\bif then\b|\bcondition(al)?\b/.test(goal)) return "branching";
  // Destructive — remove/delete an existing step. Tested before "edit".
  if (/\bremove\b|\bdelete\b/.test(goal)) return "destructive";
  // Edit — change/modify an existing step and/or add a follow-up.
  if (/\bchange\b|\bmodify\b|\bfollow-?up\b|\bupdate\b|\bedit\b/.test(goal)) return "edit";
  // Prose-only — a greeting with no actionable ask.
  if (/\bhello\b|\bhi\b|just saying/.test(goal)) return "prose";
  // Default: the primary additive/build journey.
  return "additive";
}

/** Build the response body for a fixture. */
export function fixtureBody(fixture: MockHermesFixture): unknown {
  switch (fixture) {
    case "additive":
      return additiveEnvelope();
    case "edit":
      return editEnvelope();
    case "destructive":
      return destructiveEnvelope();
    case "branching":
      return branchingEnvelope();
    case "prose":
    default:
      return proseEnvelope();
  }
}

export async function startMockHermesServer(
  opts: { port?: number } = {},
): Promise<MockHermesHandle> {
  // CS-7G: `port: 0` (or an omitted port) binds an EPHEMERAL loopback port and the handle
  // reports the ACTUAL bound port, so two instances never collide. E2E passes the pre-reserved
  // per-run port so the dev-server env + this server agree.
  const requestedPort = opts.port ?? MOCK_HERMES_DEFAULT_PORT;
  const calls: MockHermesHandle["calls"] = {
    total: 0,
    byFixture: { additive: 0, edit: 0, destructive: 0, branching: 0, prose: 0, unknown: 0 },
    lastFixture: null,
  };

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "";
    if (req.method === "GET" && url.startsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "mock-hermes" }));
      return;
    }
    if (req.method === "POST" && url.startsWith("/api/hermes-agent/guidance")) {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        let prompt = "";
        try {
          // Read the prompt ONLY to select a fixture. It is never logged or stored.
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { prompt?: unknown };
          prompt = typeof parsed.prompt === "string" ? parsed.prompt : "";
        } catch {
          prompt = "";
        }
        const fixture = selectFixture(prompt);
        calls.total += 1;
        calls.byFixture[fixture] += 1;
        calls.lastFixture = fixture;
        // Safe observability for the e2e harness: the fixture NAME only (never the
        // prompt/config). Lets the journey confirm which deterministic reply it got.
        res.writeHead(200, { "content-type": "application/json", "x-mock-fixture": fixture });
        res.end(JSON.stringify(fixtureBody(fixture)));
      });
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "NOT_FOUND" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  // Report the ACTUAL bound port (matters when requestedPort was 0 → ephemeral).
  const addr = server.address();
  const port = addr && typeof addr !== "string" ? addr.port : requestedPort;

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

/**
 * CS-7G — await the mock gateway's `/health` before starting the Next.js journey, so a request
 * can never race the mock's boot. Polls until 200 or the timeout, then throws a clear message
 * (fail-closed: a missing mock never silently falls through to a real provider).
 */
export async function waitForMockHermesHealth(
  baseUrl: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const intervalMs = opts.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const body = (await res.json()) as { ok?: boolean };
        if (body.ok === true) return;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `[e2e] mock Hermes gateway at ${baseUrl} did not become healthy within ${timeoutMs}ms` +
      (lastError ? ` (last error: ${(lastError as Error).message})` : ""),
  );
}
