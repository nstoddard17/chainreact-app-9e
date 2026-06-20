/**
 * @jest-environment node
 *
 * Nous hosted-Hermes adapter — OPT-IN LIVE SMOKE (HERMES-LIVE-SMOKE).
 *
 * Proves the REAL Nous hosted-Hermes transport works end-to-end with ChainReact's
 * `workflow_guidance_intake` prompt shape, through the existing adapter seam
 * (`createNousHermesGuidanceProvider` → `requestNousWorkflowGuidance`). This is the ONE
 * test in the suite that can hit a real, PAID provider endpoint, so it is double-gated and
 * SKIPPED BY DEFAULT. It never runs in CI (CI has no `.env.local` and never sets the
 * opt-in switches) and it never fails when disabled — it self-SKIPs.
 *
 * DOUBLE OPT-IN (both must be set in the LAUNCH environment, not auto-loaded):
 *   ENABLE_HOSTED_HERMES_GUIDANCE=true   — the rollout flag (`isHostedHermesGuidanceEnabled`)
 *   HERMES_LIVE_SMOKE=true               — this test's explicit live switch
 * plus the HERMES_* config (HERMES_BASE_URL / HERMES_API_KEY / HERMES_MODEL, …) which IS
 * auto-loaded from `.env.local` for convenience. If any of the three required config vars or
 * either switch is missing, the whole suite SKIPs.
 *
 * Run it (bash), exactly once — it calls the real paid endpoint:
 *   ENABLE_HOSTED_HERMES_GUIDANCE=true HERMES_LIVE_SMOKE=true \
 *     npx jest tests/unit/services/ai-guidance/nousHermesAdapter.live.dev.test.ts
 *
 * SECRET DISCIPLINE: this test reads HERMES_API_KEY (to assert it appears ONLY in the
 * Authorization header) but NEVER logs, prints, or serializes it into output. It captures
 * console output during the live call and asserts neither the key nor a fake canary secret is
 * ever logged. See docs/runbooks/hosted-hermes-setup.md.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  createNousHermesGuidanceProvider,
  type HermesFetch,
  type HermesHttpResponse,
} from "@/services/ai-guidance/nousHermesAdapter";
import { HOSTED_HERMES_GUIDANCE_FLAG } from "@/services/ai-guidance/flags";
import { getHermesGuidanceConfig, HERMES_REQUIRED_VARS } from "@/services/ai-guidance/hermesConfig";
import { validateWorkflowPlan } from "@/services/ai-guidance/validateWorkflowPlan";
import { toSanitizedSkillEvent } from "@/services/ai-guidance/skillEventBoundary";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";
import type { GuidanceSession, WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";

/**
 * Load ONLY the HERMES_* config values from `.env.local` (so the operator doesn't have to
 * re-type the base URL / key / model). It deliberately does NOT load the two opt-in switches
 * (`ENABLE_HOSTED_HERMES_GUIDANCE`, `HERMES_LIVE_SMOKE`): those must come from the actual launch
 * environment so the live call stays an explicit, conscious opt-in. This is what keeps the
 * focused non-live run (`npx jest tests/unit/services/ai-guidance`) from ever calling out, even
 * on a dev box whose `.env.local` has the switches set for the running app.
 */
function loadHermesConfigFromEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const NEVER_AUTOLOAD = new Set(["ENABLE_HOSTED_HERMES_GUIDANCE", "HERMES_LIVE_SMOKE"]);
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (!key.startsWith("HERMES_") || NEVER_AUTOLOAD.has(key)) continue;
    if (process.env[key]) continue; // never override an explicit launch value
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
loadHermesConfigFromEnvLocal();

const FLAG_ON = process.env[HOSTED_HERMES_GUIDANCE_FLAG] === "true";
const LIVE_ON = process.env.HERMES_LIVE_SMOKE === "true";
const CONFIG_PRESENT = HERMES_REQUIRED_VARS.every((v) => !!process.env[v]?.trim());
const RUN = FLAG_ON && LIVE_ON && CONFIG_PRESENT;

const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  const missing = HERMES_REQUIRED_VARS.filter((v) => !process.env[v]?.trim());
  // Names only — NEVER values. Safe to print in any environment (incl. CI).
  console.log(
    "SKIP Nous hosted-Hermes LIVE smoke — needs ENABLE_HOSTED_HERMES_GUIDANCE=true AND " +
      "HERMES_LIVE_SMOKE=true (both from the launch env) plus HERMES_* config. " +
      `flagOn=${FLAG_ON} liveOn=${LIVE_ON} ` +
      (missing.length ? `missingConfig=[${missing.join(", ")}]` : "config=present") +
      ". This is an opt-in PAID live call — see docs/runbooks/hosted-hermes-setup.md.",
  );
}

// The fake, non-private prompt (HERMES-LIVE-SMOKE spec). A fake canary secret is appended so we
// can prove (a) the safe prompt builder redacts obvious secret shapes out of the request body, and
// (b) nothing echoes the canary into a global skill event or logged output.
const FAKE_PROMPT =
  "I keep forgetting to follow up with leads. I don't know what workflow I need. Help me figure it out.";
const FAKE_SECRET = "sk-livesmokeCANARYdonotecho0123456789"; // sk- + ≥16 alnum → redacted by the builder
const GOAL_TEXT = `${FAKE_PROMPT} (test canary, please ignore this token: ${FAKE_SECRET})`;

// A user who does not yet know what to build → an empty workflow shape.
const REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

/** Always-on, CI-safe: disabled → no network, no throw (proves the skip contract). */
describe("Nous hosted-Hermes LIVE smoke — disabled-by-default safety (CI-safe)", () => {
  const savedFlag = process.env[HOSTED_HERMES_GUIDANCE_FLAG];
  afterEach(() => {
    if (savedFlag === undefined) delete process.env[HOSTED_HERMES_GUIDANCE_FLAG];
    else process.env[HOSTED_HERMES_GUIDANCE_FLAG] = savedFlag;
  });

  it("flag OFF → PROVIDER_DISABLED, never touches the network (skips, does not fail)", async () => {
    delete process.env[HOSTED_HERMES_GUIDANCE_FLAG];
    const fetchImpl = jest.fn<Promise<HermesHttpResponse>, Parameters<HermesFetch>>();
    const res = await createNousHermesGuidanceProvider({ fetchImpl, goalText: GOAL_TEXT }).getWorkflowGuidance(REQUEST);
    expect(res).toEqual({ ok: false, code: "PROVIDER_DISABLED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describeLive("Nous hosted-Hermes LIVE smoke — real paid endpoint (opt-in)", () => {
  it(
    "calls the real Nous endpoint with the guidance prompt shape; key only in the header; advisory only",
    async () => {
      const cfg = getHermesGuidanceConfig();
      expect(cfg).not.toBeNull();
      if (!cfg) return; // gate guarantees non-null; this narrows the type

      // --- spy fetch: capture the outgoing request + a CLONE of the raw response, then
      // forward to the REAL global fetch (this is the single live network call). ---
      let capturedUrl: string | undefined;
      let capturedInit: Parameters<HermesFetch>[1] | undefined;
      let capturedRawResponseText = "";
      const realFetch = globalThis.fetch as unknown as (u: string, i: unknown) => Promise<Response>;
      const spyFetch: HermesFetch = async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        const res = await realFetch(url, init);
        try {
          capturedRawResponseText = await res.clone().text();
        } catch {
          /* clone/read is best-effort; the adapter still reads the original body */
        }
        return res as unknown as HermesHttpResponse;
      };

      // --- capture ALL console output during the live call to assert nothing leaks. ---
      const consoleArgs: string[] = [];
      const channels = ["log", "info", "warn", "error", "debug"] as const;
      const sink = console as unknown as Record<string, (...args: unknown[]) => void>;
      const originals = channels.map((c) => [c, sink[c]] as const);
      for (const c of channels) {
        sink[c] = (...args: unknown[]) => {
          consoleArgs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
        };
      }

      const startedAt = Date.now();
      let res: Awaited<ReturnType<ReturnType<typeof createNousHermesGuidanceProvider>["getWorkflowGuidance"]>>;
      try {
        const provider = createNousHermesGuidanceProvider({ fetchImpl: spyFetch, goalText: GOAL_TEXT });
        res = await provider.getWorkflowGuidance(REQUEST);
      } finally {
        for (const [c, fn] of originals) if (fn) sink[c] = fn;
      }
      const elapsedMs = Date.now() - startedAt;

      // ---------------------------------------------------------------------------------
      // 1. TRANSPORT: the real call reached the OpenAI-compatible chat-completions endpoint
      //    with the guidance prompt shape and produced a usable, OpenAI-compatible reply.
      // ---------------------------------------------------------------------------------
      expect(capturedUrl).toBe(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`);
      expect(capturedInit?.method).toBe("POST");
      expect(capturedRawResponseText.length).toBeGreaterThan(0);

      const rawReply = JSON.parse(capturedRawResponseText) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: Record<string, unknown>;
        model?: unknown;
      };
      const replyContent = rawReply.choices?.[0]?.message?.content;
      // Usable guidance: the brain produced non-empty content for the human (independent of
      // whether our defensive JSON parser extracted structured suggestions).
      expect(typeof replyContent).toBe("string");
      expect((replyContent as string).trim().length).toBeGreaterThan(0);

      // The seam returns a well-formed GuidanceResult: either ok (parsed suggestions) or a SAFE
      // failure code. The transport "succeeded" — only a genuine transport/timeout failure is a
      // smoke failure; a strict-JSON parse miss (INVALID_RESPONSE) still proves the endpoint works.
      expect(res.ok === true || (res.ok === false && res.code === "INVALID_RESPONSE")).toBe(true);
      if (res.ok) {
        expect(res.response.providerId).toBe("hermes");
        expect(res.response.modelTag).toBe(cfg.model);
        expect(Array.isArray(res.response.suggestions)).toBe(true);
      }

      // ---------------------------------------------------------------------------------
      // 2. WorkflowPlan: the current live contract returns advisory SUGGESTIONS, not a
      //    WorkflowPlan, so none is extracted here. But IF the model's raw reply happens to
      //    carry a plan-like { steps:[{provider,type,role}] }, validate it against the real
      //    capability registry (Hermes may hallucinate providers; ChainReact is the truth).
      // ---------------------------------------------------------------------------------
      const maybePlan = tryExtractPlan(replyContent);
      if (maybePlan) {
        const verdict = validateWorkflowPlan(maybePlan);
        // A well-formed verdict either way — we don't require the brain to be right, only that
        // the deterministic validator gates it (ok, or ok:false with the offending steps named).
        expect(verdict.ok === true || (verdict.ok === false && Array.isArray(verdict.invalidSteps))).toBe(true);
      }

      // ---------------------------------------------------------------------------------
      // 3. ADVISORY ONLY: the result cannot carry an apply/mutation. By contract a
      //    GuidanceResult only suggests; assert nothing in it claims to have applied/created.
      // ---------------------------------------------------------------------------------
      const serializedRes = JSON.stringify(res);
      expect(serializedRes).not.toMatch(/"notApplied"\s*:\s*false/);
      expect(serializedRes).not.toMatch(/"applied"\s*:\s*true/);

      // ---------------------------------------------------------------------------------
      // 4. SECRET DISCIPLINE.
      // ---------------------------------------------------------------------------------
      // 4a. The API key is in the Authorization header, and ONLY there.
      expect(capturedInit?.headers.authorization).toBe(`Bearer ${cfg.apiKey}`);
      expect(capturedInit?.body ?? "").not.toContain(cfg.apiKey);
      // 4b. The fake canary secret in the prompt was redacted out of the request body.
      expect(capturedInit?.body ?? "").not.toContain(FAKE_SECRET);
      // 4c. The endpoint does not echo our key back, and nothing logged the key or the canary.
      expect(capturedRawResponseText).not.toContain(cfg.apiKey);
      const consoleBlob = consoleArgs.join("\n");
      expect(consoleBlob).not.toContain(cfg.apiKey);
      expect(consoleBlob).not.toContain(FAKE_SECRET);

      // ---------------------------------------------------------------------------------
      // 5. PRIVATE → GLOBAL BOUNDARY: a private session that literally contains the canary
      //    secret in its conversation text must NOT leak it into a global skill event.
      // ---------------------------------------------------------------------------------
      const session = makePrivateSessionWithCanary();
      const plan = maybePlan ?? makeAdvisoryPlan();
      const skillEvent = toSanitizedSkillEvent({
        session,
        plan,
        eventKind: "workflow_plan_proposed",
        outcome: "proposed",
      });
      const serializedEvent = JSON.stringify(skillEvent);
      expect(serializedEvent).not.toContain(FAKE_SECRET);
      expect(serializedEvent).not.toContain(cfg.apiKey);

      // Safe, no-secret operator report (latency + token usage if the endpoint reported it).
      const usage = rawReply.usage ?? null;
      console.log(
        `[HERMES-LIVE-SMOKE] model=${cfg.model} ok=${res.ok} elapsedMs=${elapsedMs} ` +
          `replyChars=${(replyContent as string).length} usage=${usage ? JSON.stringify(usage) : "n/a"}`,
      );
    },
    60_000,
  );
});

/** Best-effort: parse the model content and return a WorkflowPlan only if it is plan-shaped. */
function tryExtractPlan(content: unknown): WorkflowPlan | null {
  if (typeof content !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const obj = parsed as { steps?: unknown; title?: unknown; summary?: unknown };
  if (!Array.isArray(obj.steps)) return null;
  const steps: WorkflowPlanStep[] = obj.steps
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .filter((s) => typeof s.provider === "string" && typeof s.type === "string" && typeof s.role === "string")
    .map((s, i) => ({
      ref: typeof s.ref === "string" ? s.ref : `s${i}`,
      role: s.role as WorkflowPlanStep["role"],
      provider: s.provider as string,
      type: s.type as string,
      purpose: typeof s.purpose === "string" ? s.purpose : "",
    }));
  if (steps.length === 0) return null;
  return {
    schemaVersion: 1,
    title: typeof obj.title === "string" ? obj.title : "live smoke plan",
    summary: typeof obj.summary === "string" ? obj.summary : "",
    steps,
    notApplied: true,
  };
}

/** A minimal valid advisory plan (a structural logic step — no provider capability claimed). */
function makeAdvisoryPlan(): WorkflowPlan {
  return {
    schemaVersion: 1,
    title: "live smoke advisory plan",
    summary: "structural-only",
    steps: [{ ref: "s0", role: "logic", provider: "core", type: "branch", purpose: "advisory only" }],
    notApplied: true,
  };
}

/** A private, account-scoped session whose conversation text contains the canary secret. */
function makePrivateSessionWithCanary(): GuidanceSession {
  return {
    id: "sess-live-smoke",
    accountId: "acct-live-smoke",
    userId: "user-live-smoke",
    status: "open",
    turns: [
      { id: "t0", role: "user", text: GOAL_TEXT, createdAt: "2026-06-20T00:00:00.000Z" },
      {
        id: "t1",
        role: "assistant",
        text: `Here is a private reply that also mentions the canary ${FAKE_SECRET}.`,
        createdAt: "2026-06-20T00:00:01.000Z",
      },
    ],
    createdAt: "2026-06-20T00:00:00.000Z",
  };
}
