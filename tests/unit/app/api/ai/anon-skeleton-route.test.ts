/**
 * @jest-environment node
 *
 * POST /api/ai/anon-skeleton (REACT-LIVE-SKELETON-2) — free, no-auth deterministic skeleton.
 *
 * Proves: NO auth required; supported catalog-backed shapes (manual→Slack, manual→Mailchimp add tag)
 * return a validated plan + non-applied preview; an unsupported-but-recognized shape (Mailchimp
 * send-email) returns no plan + an exact catalog-gap warning; ambiguous prompts fail closed; the body
 * is size/shape bounded. The real deterministic inferer + catalog run (no mocks) — and it never calls
 * AI / a provider / the DB (the route imports none of those).
 */
import { POST } from "@/app/api/ai/anon-skeleton/route";

function call(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://x/api/ai/anon-skeleton", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

// Vary the IP per test so the per-instance rate limiter never trips across cases.
let ipCounter = 0;
function freshIp(): Record<string, string> {
  ipCounter += 1;
  return { "x-forwarded-for": `10.0.0.${ipCounter}` };
}

describe("anon-skeleton route — supported shapes (no auth)", () => {
  it("manual → Slack channel message → 200 with a validated plan + non-applied preview", async () => {
    const res = await call({ goalText: "when I run this manually, send a Slack message to a channel" }, freshIp());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.plan).not.toBeNull();
    expect(body.plan.steps.map((s: { provider: string; type: string }) => `${s.provider}:${s.type}`)).toEqual([
      "native:manual.run",
      "slack:send_channel_message",
    ]);
    expect(body.preview).not.toBeNull();
    expect(body.preview.notApplied).toBe(true);
  });

  it("manual → Mailchimp add tag → 200 with a validated plan", async () => {
    const res = await call({ goalText: "tag canceled customers in Mailchimp with a win-back tag" }, freshIp());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.steps.map((s: { provider: string; type: string }) => `${s.provider}:${s.type}`)).toEqual([
      "native:manual.run",
      "mailchimp:add_tag",
    ]);
    expect(body.preview).not.toBeNull();
  });
});

describe("anon-skeleton route — fails closed / catalog gap", () => {
  it("Mailchimp win-back EMAIL → no plan + an exact catalog-gap warning", async () => {
    const res = await call({ goalText: "send a win-back email campaign in Mailchimp" }, freshIp());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBeNull();
    expect(body.preview).toBeNull();
    expect(body.warnings.join(" ")).toMatch(/send-campaign|send-email/i);
  });

  it("an ambiguous prompt → no plan, no warnings (fail closed)", async () => {
    const res = await call({ goalText: "automate my business" }, freshIp());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBeNull();
    expect(body.preview).toBeNull();
    expect(body.warnings).toBeUndefined();
  });
});

describe("anon-skeleton route — input bounds", () => {
  it("empty goalText → 400", async () => {
    const res = await call({ goalText: "" }, freshIp());
    expect(res.status).toBe(400);
  });

  it("non-JSON body → 400", async () => {
    const res = await call("not json", freshIp());
    expect(res.status).toBe(400);
  });

  it("over-long goalText → 400", async () => {
    const res = await call({ goalText: "x".repeat(2_001) }, freshIp());
    expect(res.status).toBe(400);
  });

  it("an unknown extra field → 400 (.strict)", async () => {
    const res = await call({ goalText: "manual run send slack message", accountId: "acct-EVIL" }, freshIp());
    expect(res.status).toBe(400);
  });
});
