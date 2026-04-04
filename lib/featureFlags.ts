/**
 * Centralized feature flags for ChainReact.
 *
 * Follows the ENABLE_ environment variable pattern
 * (precedent: ENABLE_FILE_LOGGING in lib/logging/).
 *
 * Usage:
 *   import { FEATURE_FLAGS } from '@/lib/featureFlags'
 *   if (FEATURE_FLAGS.LOOP_COST_EXPANSION) { ... }
 */
export const FEATURE_FLAGS = {
  /**
   * When true, loop nodes are charged upfront at worst-case cost
   * (inner node cost × configured max iterations, capped at 500).
   * When false, loops are treated as logic nodes (0 cost) and
   * inner nodes are counted once (flat cost).
   *
   * Rollout: deploy false → validate audit logs → enable for beta → enable for all.
   */
  LOOP_COST_EXPANSION: process.env.ENABLE_LOOP_COST_EXPANSION === 'true',

  /**
   * When true, Stage 1 (node selection) uses gpt-4o-mini instead of gpt-4o.
   * Node selection is a constrained matching task against a compact catalog
   * (~2K tokens) — the cheaper model handles it well.
   *
   * Rollout: deploy true → monitor eval events for quality regression → disable if >10% drop.
   */
  USE_MINI_FOR_NODE_SELECTION:
    process.env.ENABLE_MINI_FOR_NODE_SELECTION !== 'false',

  /**
   * When true, user-specific correction patterns from agent_eval_events
   * are injected into Stage 2 (configuration) of the LLM planner.
   * This helps the AI avoid repeating mistakes users have already corrected.
   *
   * Rollout: deploy false → enable for beta → validate rebuild rate drops → enable for all.
   */
  PLANNER_USER_LEARNINGS: process.env.ENABLE_PLANNER_USER_LEARNINGS === 'true',
} as const
