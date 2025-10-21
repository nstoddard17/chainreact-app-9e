# Plan-Based Restrictions Implementation Guide

**Created:** October 21, 2025
**Status:** ✅ Implemented

## Overview

ChainReact now has a comprehensive plan-based restriction system that gates features behind different subscription tiers. This prevents free users from accessing premium features while providing a smooth upgrade path.

## Architecture

### Core Files

1. **`/lib/utils/plan-restrictions.ts`** - Central configuration
   - Defines all plan tiers: `free`, `starter`, `professional`, `team`, `enterprise`
   - `PlanLimits` interface with all feature flags and limits
   - `PLAN_LIMITS` constant with complete configuration
   - Helper functions: `hasFeatureAccess()`, `getMinimumPlanForFeature()`, `canPerformAction()`

2. **`/hooks/use-plan-restrictions.ts`** - React hook
   - `checkFeatureAccess(feature)` - Check if user can access a feature
   - `checkActionLimit(action, currentCount)` - Check usage limits
   - `getCurrentLimits()` - Get current plan's limits
   - `isPlanOrHigher(plan)` - Compare plan hierarchy

3. **`/components/plan-restrictions/LockedFeature.tsx`** - Wrapper component
   - Wraps features that require plan upgrades
   - Shows lock icon overlay
   - Opens upgrade modal on click
   - Makes wrapped content non-interactive

4. **`/components/plan-restrictions/UpgradePlanModal.tsx`** - Upgrade dialog
   - Shows required plan details
   - Lists key features included
   - Pricing information
   - Call-to-action buttons

## Plan Tiers & Features

### Free Plan
- **Tasks:** 100/month
- **Active Workflows:** 5
- **Total Workflows:** 10
- **Features:** Basic single-step workflows only
- **No Access To:** Multi-step, AI, conditionals, webhooks, scheduling, team sharing

### Starter Plan ($14.99/mo)
- **Tasks:** 1,000/month
- **Workflows:** Unlimited
- **Features:** Multi-step, conditionals, webhooks, scheduling, error notifications
- **Still Locked:** AI Agents, team features

### Professional Plan ($39/mo) - Most Popular
- **Tasks:** 5,000/month
- **Key Feature:** AI Agents included (major differentiator vs Zapier)
- **Also Includes:** Everything in Starter + advanced analytics, priority support

### Team Plan ($79/mo)
- **Tasks:** 50,000/month
- **Key Feature:** Team sharing & collaboration
- **Team Members:** Up to 25
- **Also Includes:** Shared workspaces, 365-day history retention

### Enterprise Plan (Custom)
- **Everything:** Unlimited
- **Support:** Dedicated support team
- **Custom:** Pricing and features

## Usage Examples

### Example 1: Locking Team Sharing in Create Workflow Dialog

```tsx
import { LockedFeature } from '@/components/plan-restrictions'

function CreateWorkflowDialog() {
  return (
    <Dialog>
      {/* ... other fields ... */}

      <LockedFeature
        feature="teamSharing"
        showLockIcon={true}
        fallbackMessage="Team sharing is available on the Team plan"
      >
        <div className="space-y-2 pt-2 border-t">
          <Label>Share with Teams (Optional)</Label>
          {/* Team selection UI */}
        </div>
      </LockedFeature>
    </Dialog>
  )
}
```

**Result:**
- Free/Starter/Pro users see the section grayed out with lock icon
- Clicking opens upgrade modal showing Team plan
- Team/Enterprise users see normal interactive UI

### Example 2: Checking Workflow Creation Limit

```tsx
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions'

function WorkflowList() {
  const { checkActionLimit } = usePlanRestrictions()
  const workflows = useWorkflowStore(state => state.workflows)

  const handleCreateWorkflow = async () => {
    // Check if user can create more workflows
    const limit = checkActionLimit('createWorkflow', workflows.length)

    if (!limit.allowed) {
      toast({
        title: "Workflow Limit Reached",
        description: limit.reason, // "You've reached your workflow limit (10). Upgrade to create more."
        variant: "destructive"
      })
      // Show upgrade modal
      setUpgradeModalOpen(true)
      return
    }

    // Proceed with creation...
  }
}
```

### Example 3: Feature-Gated Button

```tsx
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions'

function AIAgentButton() {
  const { checkFeatureAccess } = usePlanRestrictions()
  const aiAccess = checkFeatureAccess('aiAgents')

  return (
    <Button
      disabled={!aiAccess.allowed}
      onClick={handleAddAIAgent}
    >
      Add AI Agent
      {!aiAccess.allowed && <Lock className="ml-2 w-4 h-4" />}
    </Button>
  )
}
```

## Implementation Checklist

When adding plan restrictions to a new feature:

- [ ] Add feature flag to `PlanLimits` interface in `plan-restrictions.ts`
- [ ] Set feature availability for each plan tier in `PLAN_LIMITS`
- [ ] Add descriptive name to `featureNames` in `UpgradePlanModal.tsx`
- [ ] Wrap UI in `<LockedFeature>` component OR use `checkFeatureAccess()` hook
- [ ] Test with different plan levels (switch profile.plan in database)
- [ ] Verify upgrade modal shows correct plan and pricing
- [ ] Check that locked state is visually clear

## Database Schema

The `user_profiles` table includes:

```sql
plan TEXT DEFAULT 'free' NOT NULL CHECK (plan IN ('free', 'starter', 'professional', 'team', 'enterprise'))
tasks_used INTEGER DEFAULT 0 NOT NULL CHECK (tasks_used >= 0)
tasks_limit INTEGER DEFAULT 100 NOT NULL CHECK (tasks_limit > 0)
billing_period_start TIMESTAMPTZ DEFAULT NOW() NOT NULL
```

## Testing

To test different plan levels:

```sql
-- Set user to Professional plan
UPDATE user_profiles
SET plan = 'professional', tasks_limit = 5000
WHERE id = 'user-id';

-- Set user to Free plan
UPDATE user_profiles
SET plan = 'free', tasks_limit = 100
WHERE id = 'user-id';
```

Then refresh the page to see different features locked/unlocked.

## Future Enhancements

1. **Backend Enforcement:** Currently frontend-only. Should add API checks to prevent bypass
2. **Stripe Integration:** Connect upgrade buttons to actual Stripe checkout
3. **Trial Period:** Implement 14-day trial for paid plans
4. **Usage Tracking:** Track actual task consumption and reset monthly
5. **Overage Handling:** Allow users to continue with overage fees
6. **Plan Analytics:** Track which features drive upgrades

## Files Modified

- ✅ `/lib/utils/plan-restrictions.ts` - Core logic (NEW)
- ✅ `/hooks/use-plan-restrictions.ts` - React hook (NEW)
- ✅ `/components/plan-restrictions/LockedFeature.tsx` - Lock UI (NEW)
- ✅ `/components/plan-restrictions/UpgradePlanModal.tsx` - Upgrade dialog (NEW)
- ✅ `/components/plan-restrictions/index.ts` - Exports (NEW)
- ✅ `/components/new-design/HomeContent.tsx` - Integrated restrictions
- ✅ `/components/workflows/WorkflowShareButton.tsx` - Example usage (NEW)

## Common Gotchas

1. **Plan Name Case Sensitivity:** Database stores lowercase ('free'), UI displays capitalized ('Free')
2. **Unlimited Values:** Use `-1` for unlimited, not `null` or `Infinity`
3. **Feature Dependencies:** Some features depend on others (e.g., AI Agents need multi-step workflows)
4. **Lock Icon Position:** Use `showLockIcon={true}` on wrapper divs, not on buttons
5. **Modal Trigger:** LockedFeature already handles click → modal, don't duplicate
