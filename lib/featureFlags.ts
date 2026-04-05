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
} as const
