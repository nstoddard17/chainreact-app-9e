/**
 * @jest-environment node
 *
 * POST /api/ai/anonymous-workflow-guidance (REACT-LIVE-SKELETON-3) — limited anonymous AI planning.
 *
 * Proves: NO auth required; returns a validated plan + non-applied preview + remaining attempts; the
 * signed cookie cap is enforced SERVER-SIDE (limit response makes no model call); a recognized shape
 * with no model plan falls back to the deterministic catalog plan; gateway-unavailable → 503 with NO
 * attempt consumed; input is size/shape bounded. The model runner is mocked at the route boundary; the
 * deterministic fallback + catalog run for real.
 */
const mockRun = jest.fn();
jest.mock("@/services/ai-guidance/anonymousGuidance", () => ({
  runAnonymousWorkflowGuidance: (...a: unknown[]) => mockRun(...a),
}));

import { POST } from "@/app/api/ai/anonymous-workflow-guidance/route";
import { ANON_AI_COOKIE_NAME, serializeAnonAiCookieValue, __resetIpSoftCapForTests } from "@/lib/anonAiLimit";

const ORIGINAL_ENV = { ...process.env };
const NOW = Date.now();

let ipCounter = 0;
function call(body: unknown, cookie?: string) {
  ipCounter += 1;
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": `10.1.0.${ipCounter}` };
  if (cookie) headers["cookie"] = cookie;
  return POST(
    new Request("http://x/api/ai/anonymous-workflow-guidance", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const MODEL_PLAN = { schemaVersion: 1, title: "Lead → Slack", summary: "", notApplied: true, steps: [{ ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "" }, { ref: "s1", role: "action", provider: "slack", type: "send_channel_message", purpose: "" }] };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, OAUTH_STATE_SIGNING_KEY: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64") };
  __resetIpSoftCapForTests();
  mockRun.mockReset().mockResolvedValue({ ok: true, guidanceText: "Here's a plan.", workflowPlan: MODEL_PLAN });
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("anonymous guidance route — planning (no auth)", () => {
  it("returns a validated plan + preview + remaining attempts and sets the signed cap cookie", async () => {
    const res = await call({ goalText: "when a lead comes in, send a slack message" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.workflowPlan).toEqual(MODEL_PLAN);
    expect(body.previewDraft).not.toBeNull();
    expect(body.previewDraft.notApplied).toBe(true);
    expect(body.limitReached).toBe(false);
    expect(body.remainingAnonymousAttempts).toBe(2); // limit 3, this consumed 1
    // The server set the (HttpOnly) counter cookie.
    expect(res.headers.get("set-cookie")).toContain(`${ANON_AI_COOKIE_NAME}=`);
    expect(res.headers.get("set-cookie")?.toLowerCase()).toContain("httponly");
  });

  it("requires no user/account/workflow (a bare body works)", async () => {
    const res = await call({ goalText: "plan something" });
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalled();
  });

  it("missing config values still preview — a model plan with requiredInputs is returned as-is", async () => {
    mockRun.mockResolvedValue({
      ok: true,
      guidanceText: "Shape is clear; finish details.",
      workflowPlan: { ...MODEL_PLAN, steps: [{ ...MODEL_PLAN.steps[0] }, { ...MODEL_PLAN.steps[1], requiredInputs: ["channel", "text"] }] },
    });
    const res = await call({ goalText: "send slack channel message" });
    const body = await res.json();
    expect(body.workflowPlan).not.toBeNull();
    expect(body.previewDraft).not.toBeNull();
  });

  it("falls back to the deterministic catalog plan when the model returns no plan", async () => {
    mockRun.mockResolvedValue({ ok: true, guidanceText: "Prose only.", workflowPlan: null });
    const res = await call({ goalText: "when I run this manually, send a Slack message to a channel" });
    const body = await res.json();
    expect(body.workflowPlan).not.toBeNull();
    expect(body.workflowPlan.steps.map((s: { provider: string; type: string }) => `${s.provider}:${s.type}`)).toEqual([
      "native:manual.run",
      "slack:send_channel_message",
    ]);
  });

  it("fails closed (no plan, no preview) for an unsupported shape with no model plan", async () => {
    mockRun.mockResolvedValue({ ok: true, guidanceText: "I can't plan that.", workflowPlan: null });
    const res = await call({ goalText: "do something vague and unautomatable" });
    const body = await res.json();
    expect(body.workflowPlan).toBeNull();
    expect(body.previewDraft).toBeNull();
  });
});

describe("anonymous guidance route — limit enforcement (server-side)", () => {
  it("a cookie at the cap returns limitReached + NO model call", async () => {
    const atCap = `${ANON_AI_COOKIE_NAME}=${serializeAnonAiCookieValue(3, NOW)}`;
    const res = await call({ goalText: "plan another one" }, atCap);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limitReached).toBe(true);
    expect(body.remainingAnonymousAttempts).toBe(0);
    expect(body.workflowPlan).toBeNull();
    expect(body.guidanceText).toMatch(/create a free account/i);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("the last allowed attempt reports limitReached + 0 remaining", async () => {
    const atTwo = `${ANON_AI_COOKIE_NAME}=${serializeAnonAiCookieValue(2, NOW)}`;
    const res = await call({ goalText: "last free one" }, atTwo);
    const body = await res.json();
    expect(body.remainingAnonymousAttempts).toBe(0);
    expect(body.limitReached).toBe(true);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});

describe("anonymous guidance route — availability + bounds", () => {
  it("gateway unavailable → 503 and consumes NO attempt (no cookie advance)", async () => {
    mockRun.mockResolvedValue({ ok: false, code: "PROVIDER_DISABLED", message: "unavailable" });
    const res = await call({ goalText: "plan" });
    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("empty goalText → 400; non-JSON → 400; extra field → 400 (.strict); over-long → 400", async () => {
    expect((await call({ goalText: "" })).status).toBe(400);
    expect((await call("not json")).status).toBe(400);
    expect((await call({ goalText: "ok", accountId: "acct-EVIL" })).status).toBe(400);
    expect((await call({ goalText: "x".repeat(2_001) })).status).toBe(400);
  });
});
