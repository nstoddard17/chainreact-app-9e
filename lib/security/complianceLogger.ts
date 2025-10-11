import { createClient } from "@supabase/supabase-js"

export interface ComplianceLogEntry {
  organization_id?: string
  user_id?: string
  session_id?: string
  action: string
  resource_type: string
  resource_id?: string
  old_values?: any
  new_values?: any
  ip_address?: string
  user_agent?: string
  geolocation?: any
  risk_score?: number
  compliance_tags?: string[]
  retention_until?: string
}

export class ComplianceLogger {
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  async logAction(entry: ComplianceLogEntry) {
    // Calculate retention period based on compliance requirements
    const retentionUntil = this.calculateRetentionPeriod(entry.compliance_tags || [])

    const { error } = await this.supabase.from("compliance_audit_logs").insert({
      ...entry,
      retention_until: retentionUntil,
      risk_score: entry.risk_score || this.calculateRiskScore(entry),
    })

    if (error) {
      console.error("Failed to log compliance action:", error)
    }
  }

  async logDataAccess(userId: string, resourceType: string, resourceId: string, purpose: string) {
    await this.logAction({
      user_id: userId,
      action: "data_access",
      resource_type: resourceType,
      resource_id: resourceId,
      compliance_tags: ["gdpr", "data_access"],
      new_values: { purpose },
    })
  }

  async logDataModification(userId: string, resourceType: string, resourceId: string, oldValues: any, newValues: any) {
    await this.logAction({
      user_id: userId,
      action: "data_modification",
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: oldValues,
      new_values: newValues,
      compliance_tags: ["gdpr", "data_modification"],
      risk_score: this.calculateDataModificationRisk(oldValues, newValues),
    })
  }

  async logDataDeletion(userId: string, resourceType: string, resourceId: string, deletedData: any) {
    await this.logAction({
      user_id: userId,
      action: "data_deletion",
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: deletedData,
      compliance_tags: ["gdpr", "data_deletion", "right_to_erasure"],
      risk_score: 8, // High risk for data deletion
    })
  }

  async getAuditTrail(
    organizationId: string,
    filters?: {
      startDate?: string
      endDate?: string
      userId?: string
      resourceType?: string
      action?: string
      minRiskScore?: number
    },
  ) {
    let query = this.supabase
      .from("compliance_audit_logs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })

    if (filters?.startDate) {
      query = query.gte("created_at", filters.startDate)
    }
    if (filters?.endDate) {
      query = query.lte("created_at", filters.endDate)
    }
    if (filters?.userId) {
      query = query.eq("user_id", filters.userId)
    }
    if (filters?.resourceType) {
      query = query.eq("resource_type", filters.resourceType)
    }
    if (filters?.action) {
      query = query.eq("action", filters.action)
    }
    if (filters?.minRiskScore) {
      query = query.gte("risk_score", filters.minRiskScore)
    }

    const { data, error } = await query.limit(1000)

    if (error) throw error
    return data
  }

  private calculateRetentionPeriod(complianceTags: string[]): string {
    // Different retention periods based on compliance requirements
    if (complianceTags.includes("financial")) {
      // 7 years for financial data
      return new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000).toISOString()
    } else if (complianceTags.includes("gdpr")) {
      // 6 years for GDPR compliance
      return new Date(Date.now() + 6 * 365 * 24 * 60 * 60 * 1000).toISOString()
    } 
      // Default 3 years
      return new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString()
    
  }

  private calculateRiskScore(entry: ComplianceLogEntry): number {
    let score = 1

    // Higher risk for sensitive actions
    if (["data_deletion", "user_deletion", "permission_change"].includes(entry.action)) {
      score += 5
    }

    // Higher risk for admin actions
    if (entry.resource_type === "admin" || entry.action.includes("admin")) {
      score += 3
    }

    // Higher risk for bulk operations
    if (entry.action.includes("bulk") || entry.action.includes("mass")) {
      score += 4
    }

    return Math.min(score, 10) // Cap at 10
  }

  private calculateDataModificationRisk(oldValues: any, newValues: any): number {
    let risk = 2 // Base risk for any modification

    // Check for sensitive field changes
    const sensitiveFields = ["email", "password", "permissions", "role", "access_token"]
    const changedFields = Object.keys(newValues || {})

    const sensitiveChanges = changedFields.filter((field) =>
      sensitiveFields.some((sensitive) => field.toLowerCase().includes(sensitive)),
    )

    risk += sensitiveChanges.length * 2

    return Math.min(risk, 10)
  }
}
