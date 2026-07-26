/**
 * @jest-environment node
 *
 * REACT-AGENT-PRODUCTION-TIMEOUT-1 — the guidance routes' serverless budget must stay declared, and
 * must stay LARGER than the gateway client's abort deadline.
 *
 * The production incident this guards: a complex builder turn aborted at the gateway client's 30s
 * deadline and surfaced as an opaque 503. The fix is a two-part budget —
 *   gateway abort (`HERMES_AGENT_TIMEOUT_MS`, default `DEFAULT_TIMEOUT_MS`, clamped `MAX_TIMEOUT_MS`)
 *     <  route budget (`export const maxDuration`)
 * — so a slow brain always yields OUR typed, renderable 503 rather than a platform
 * `FUNCTION_INVOCATION_TIMEOUT` (504, no JSON body).
 *
 * Next.js requires `maxDuration` to be a statically analyzable literal, so the routes cannot import
 * the shared constant. This scan is what keeps the literal and the constant from drifting apart —
 * a silent drift re-opens the bug in production while every unit test still passes.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  GUIDANCE_ROUTE_MAX_DURATION_SECONDS,
} from "@/services/ai-guidance/gateway/gatewayConfig";

/** Every route that calls the Hermes gateway client and therefore inherits its abort deadline. */
const GATEWAY_ROUTES = [
  "app/api/accounts/[id]/ai/workflow-guidance/route.ts",
  "app/api/ai/anonymous-workflow-guidance/route.ts",
] as const;

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("guidance routes declare a serverless budget larger than the gateway abort", () => {
  it.each(GATEWAY_ROUTES)("%s exports the shared maxDuration literal", (relPath) => {
    const src = read(relPath);
    const match = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)\s*;/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(GUIDANCE_ROUTE_MAX_DURATION_SECONDS);
  });

  it("the gateway abort deadline is strictly inside the route budget", () => {
    const budgetMs = GUIDANCE_ROUTE_MAX_DURATION_SECONDS * 1_000;
    expect(MIN_TIMEOUT_MS).toBeLessThanOrEqual(DEFAULT_TIMEOUT_MS);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(MAX_TIMEOUT_MS);
    expect(MAX_TIMEOUT_MS).toBeLessThan(budgetMs);
    // Real headroom, not one millisecond: the route still has DB reads + the post-model option
    // resolver to run after the brain answers.
    expect(budgetMs - MAX_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
  });
});
