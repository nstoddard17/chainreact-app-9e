import { useCallback, useMemo, useState } from 'react'
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions'
import type { PlanLimits, PlanTier } from '@/lib/utils/plan-restrictions'
import type { BillingScopeType } from '@/lib/billing/types'

interface FeatureGateResult {
  allowed: boolean
  requiredPlan: PlanTier | null
  showUpgrade: () => void
  upgradeModalOpen: boolean
  closeUpgradeModal: () => void
}

/**
 * Feature gate for personal/global entry points.
 * Uses the current user's personal plan — no workspace context.
 *
 * Use for: AIAssistantContent, VoiceDictation, VoiceMode, and any
 * feature that is not scoped to a specific workflow or workspace.
 */
export function usePersonalFeatureGate(
  feature: keyof PlanLimits
): FeatureGateResult {
  const { checkFeatureAccess } = usePlanRestrictions()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  const check = useMemo(() => checkFeatureAccess(feature), [checkFeatureAccess, feature])

  const showUpgrade = useCallback(() => setUpgradeModalOpen(true), [])
  const closeUpgradeModal = useCallback(() => setUpgradeModalOpen(false), [])

  return {
    allowed: check.allowed,
    requiredPlan: check.minimumPlan ?? null,
    showUpgrade,
    upgradeModalOpen,
    closeUpgradeModal,
  }
}

/**
 * Feature gate for workflow/workspace-scoped entry points.
 * Resource context is REQUIRED — scope determines entitlement.
 *
 * Use for: PromptEnhancer, SmartComposeField, AIAgentBuilderContent,
 * and any feature scoped to a specific workflow or workspace.
 *
 * NOTE: In the current implementation, this falls back to the user's
 * personal plan because scope-aware plan resolution on the client
 * requires the scope's plan to be available. This will be enhanced
 * when the backend provides scope-resolved entitlements.
 * The API contract is correct — callers must provide scope.
 */
export function useScopedFeatureGate(
  feature: keyof PlanLimits,
  scope: { scopeType: BillingScopeType; scopeId: string }
): FeatureGateResult {
  const { checkFeatureAccess } = usePlanRestrictions()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  // TODO: When backend provides scope-resolved plan data, use it here
  // instead of the user's personal plan. For now, personal plan is used
  // as a conservative check — the backend enforces the real scope.
  const check = useMemo(() => checkFeatureAccess(feature), [checkFeatureAccess, feature])

  const showUpgrade = useCallback(() => setUpgradeModalOpen(true), [])
  const closeUpgradeModal = useCallback(() => setUpgradeModalOpen(false), [])

  return {
    allowed: check.allowed,
    requiredPlan: check.minimumPlan ?? null,
    showUpgrade,
    upgradeModalOpen,
    closeUpgradeModal,
  }
}
