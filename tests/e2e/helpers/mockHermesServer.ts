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
 * SAFETY: binds to 127.0.0.1 ONLY; a fixed loopback port (so the dev-server env
 * stays static across the run); NEVER logs the prompt body, workflow config, or
 * the bearer token; records only bounded counts + the selected fixture NAME.
 * It selects a deterministic fixture from keywords in the (already de-identified)
 * prompt — it does not echo or persist the prompt.
 */

export const MOCK_HERMES_DEFAULT_PORT = 9890;

/** Fixture kinds the mock can return. */
export type MockHermesFixture = "additive" | "edit" | "destructive" | "prose" | "unknown";

export interface MockHermesHandle {
  port: number;
  baseUrl: string;
  /** Bounded diagnostics — counts + last fixture NAME only. Never prompt/config/secrets. */
  readonly calls: { total: number; byFixture: Record<MockHermesFixture, number>; lastFixture: MockHermesFixture | null };
  close(): Promise<void>;
}

// The base test workflow is Manual Trigger (editable ref node_1) → Format
// Transformer (node_2). The mock proposes EDIT-path mutation operations (a fenced
// ```json patch in the reply content) against those stable refs — the same shape
// the real gateway would return, parsed by the real `extractMutationOperationsFromText`
// + validated by the real `proposeWorkflowMutation` against the live editable graph.

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

/** EDIT: modify an existing node's config AND add one follow-up action. */
function editEnvelope(): unknown {
  return mutationEnvelope(
    "I'll update the message and add a follow-up step. Review the changes below.",
    [
      { op: "updateNodeConfig", nodeId: "node_2", config: { content: "Updated by React" } },
      {
        op: "addNode",
        node: { id: "n_follow", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 320 } },
      },
      { op: "addEdge", edge: { id: "e_follow", from: "node_2", to: "n_follow" } },
    ],
  );
}

/** DESTRUCTIVE: remove the existing follow-up step (node_2). */
function destructiveEnvelope(): unknown {
  return mutationEnvelope(
    "I'll remove the follow-up step. Review this destructive change below.",
    [{ op: "removeNode", nodeId: "node_2" }],
  );
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
  // that would otherwise mis-route every request.
  const m = prompt.match(/User goal \(their words\):\s*(.+)/i);
  const goal = (m ? m[1]! : prompt).toLowerCase();
  if (/\bremove\b|\bdelete\b/.test(goal)) return "destructive";
  if (/\bchange\b|\bmodify\b|\bfollow-?up\b|\bupdate\b/.test(goal)) return "edit";
  if (/\bhello\b|\bhi\b|just saying/.test(goal)) return "prose";
  // Default: the primary additive/build journey.
  return "additive";
}

/** Build the response body for a fixture. (edit/destructive land in later CS-7F work.) */
export function fixtureBody(fixture: MockHermesFixture): unknown {
  switch (fixture) {
    case "additive":
      return additiveEnvelope();
    case "edit":
      return editEnvelope();
    case "destructive":
      return destructiveEnvelope();
    case "prose":
    default:
      return proseEnvelope();
  }
}

export async function startMockHermesServer(
  opts: { port?: number } = {},
): Promise<MockHermesHandle> {
  const port = opts.port ?? MOCK_HERMES_DEFAULT_PORT;
  const calls: MockHermesHandle["calls"] = {
    total: 0,
    byFixture: { additive: 0, edit: 0, destructive: 0, prose: 0, unknown: 0 },
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
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

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
