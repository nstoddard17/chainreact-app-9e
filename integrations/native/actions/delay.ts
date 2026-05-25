import type { ActionHandler } from "@/services/execution/handlers/types";
import { DELAY_MAX_SECONDS, DelayConfigSchema } from "./delay.schema";

/**
 * Native `delay` action — Native-nodes Slice 1 Commit 3.
 *
 * Pure in-process sleep with a hard 30-second ceiling. Pause/resume
 * infrastructure is **Phase 6** work — anything longer than 30s must
 * compose multiple workflow runs (or wait for the Phase 6 durable
 * delay). Plan: docs/slices/parity/native-nodes-1-tier-a-plan.md §6;
 * accepted decision: NPD-N6.
 *
 * Behavioural contract locked at plan time:
 *   - Strict schema with required `seconds` integer in `[1, 30]`. No
 *     `unit` selector (V1 had seconds / minutes / hours / days). No
 *     silent defaults (Q11).
 *   - **Defense-in-depth cap guard.** Even if a malformed config
 *     bypasses the schema (e.g. a stale workflow definition saved
 *     before the schema landed), the handler throws
 *     `DelayCapExceededError` for any value above DELAY_MAX_SECONDS.
 *   - In-process only — `setTimeout` inside the engine's BFS loop.
 *     If the process is restarted during the wait, the run dies. That
 *     is the intentional cost of staying off the durable-queue path.
 *   - Output is observable: `{ delayedSeconds, startedAt, completedAt }`.
 *     Downstream nodes can reference any of these via
 *     `{{<nodeId>.completedAt}}` etc.
 *   - No log lines from the handler. The engine-layer logs the run
 *     lifecycle.
 */

export class DelayCapExceededError extends Error {
  constructor(public readonly seconds: number) {
    super(
      `delay seconds=${seconds} exceeds the ${DELAY_MAX_SECONDS}s cap. ` +
        `Durable / unbounded delay is deferred to Phase 6.`,
    );
    this.name = "DelayCapExceededError";
  }
}

export const delay: ActionHandler = async (input) => {
  const config = DelayConfigSchema.parse(input.config);

  // Defense-in-depth: catch out-of-band configs that bypassed the
  // schema (e.g. older workflow saves, future handler-recall paths).
  if (config.seconds > DELAY_MAX_SECONDS) {
    throw new DelayCapExceededError(config.seconds);
  }

  const startedAtMs = Date.now();
  await sleep(config.seconds * 1000);
  const completedAtMs = Date.now();

  return {
    output: {
      delayedSeconds: config.seconds,
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date(completedAtMs).toISOString(),
    },
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
