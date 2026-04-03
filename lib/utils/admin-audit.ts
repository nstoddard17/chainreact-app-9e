import { ComplianceLogger } from '@/lib/security/complianceLogger'
import { logger } from '@/lib/utils/logger'

let _complianceLogger: ComplianceLogger | null = null

function getComplianceLogger(): ComplianceLogger {
  if (!_complianceLogger) {
    _complianceLogger = new ComplianceLogger()
  }
  return _complianceLogger
}

export interface AdminAuditParams {
  userId: string
  action: string
  resourceType: string
  resourceId?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  request?: Request
}

/**
 * Log an admin action to the compliance audit trail.
 * Wraps ComplianceLogger with admin-specific defaults (boosted risk score,
 * admin_action tag, IP/user-agent extraction).
 *
 * Call this after the business operation succeeds, not before.
 */
export async function logAdminAction(params: AdminAuditParams): Promise<void> {
  try {
    const ipAddress = params.request?.headers.get('x-forwarded-for')
      || params.request?.headers.get('x-real-ip')
      || undefined
    const userAgent = params.request?.headers.get('user-agent') || undefined

    await getComplianceLogger().logAction({
      user_id: params.userId,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      old_values: params.oldValues,
      new_values: params.newValues,
      ip_address: ipAddress,
      user_agent: userAgent,
      compliance_tags: ['admin_action'],
    })
  } catch (error: any) {
    // Audit logging should never block the admin operation
    logger.error('[Admin Audit] Failed to log admin action', {
      action: params.action,
      resourceType: params.resourceType,
      error: error.message,
    })
  }
}
