/**
 * DEPRECATED: Auto-Subscribe Endpoint
 *
 * This endpoint is deprecated and should no longer be used.
 *
 * REASON FOR DEPRECATION:
 * - Created subscriptions on integration connection (wrong pattern)
 * - Should create subscriptions ONLY when workflows are activated
 * - Caused resource waste, duplicate subscriptions, and unnecessary renewals
 *
 * NEW PATTERN:
 * - Subscriptions are now created via TriggerLifecycleManager
 * - Happens automatically when workflow status changes to 'active'
 * - Cleaned up automatically when workflow is deactivated or deleted
 *
 * See: /lib/triggers/TriggerLifecycleManager.ts
 * See: /lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts
 *
 * DATE DEPRECATED: 2025-10-03
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

export async function POST(req: NextRequest) {
  return errorResponse('This endpoint is deprecated', 410, {
    message: 'Microsoft Graph subscriptions are now managed automatically via workflow activation. No manual subscription needed.',
    instructions: 'Simply create a workflow with a Microsoft Outlook/Teams/OneDrive trigger and activate it. Subscriptions will be created automatically.',
    deprecatedOn: '2025-10-03',
    replacedBy: 'TriggerLifecycleManager'
  }) // 410 Gone - resource permanently removed
}

export async function GET(req: NextRequest) {
  return errorResponse('This endpoint is deprecated', 410, {
    message: 'Health checks are now handled via TriggerLifecycleManager.checkWorkflowTriggerHealth()',
    deprecatedOn: '2025-10-03',
    replacedBy: 'TriggerLifecycleManager.checkWorkflowTriggerHealth()'
    })
}
