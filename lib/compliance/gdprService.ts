import { createClient } from "@supabase/supabase-js"
import { ComplianceLogger } from "../security/complianceLogger"

export interface DataSubjectRequest {
  id: string
  organization_id: string
  request_type: "access" | "rectification" | "erasure" | "portability" | "restriction"
  data_subject_email: string
  data_subject_id?: string
  request_details: any
  status: "pending" | "in_progress" | "completed" | "rejected"
  assigned_to?: string
  response_data?: any
  completed_at?: string
  created_at: string
  updated_at: string
}

export class GDPRService {
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
  private complianceLogger = new ComplianceLogger()

  async submitDataSubjectRequest(
    organizationId: string,
    requestType: DataSubjectRequest["request_type"],
    email: string,
    details: any,
  ): Promise<DataSubjectRequest> {
    const { data, error } = await this.supabase
      .from("data_subject_requests")
      .insert({
        organization_id: organizationId,
        request_type: requestType,
        data_subject_email: email,
        request_details: details,
        status: "pending",
      })
      .select()
      .single()

    if (error) throw error

    await this.complianceLogger.logAction({
      organization_id: organizationId,
      action: "gdpr_request_submitted",
      resource_type: "data_subject_request",
      resource_id: data.id,
      new_values: { request_type: requestType, email },
      compliance_tags: ["gdpr", "data_subject_rights"],
    })

    return data
  }

  async processDataAccessRequest(requestId: string, assignedTo: string): Promise<any> {
    // Get the request
    const { data: request, error } = await this.supabase
      .from("data_subject_requests")
      .select("*")
      .eq("id", requestId)
      .single()

    if (error) throw error

    // Collect all data for the subject
    const userData = await this.collectUserData(request.data_subject_email, request.organization_id)

    // Update request with response data
    const { error: updateError } = await this.supabase
      .from("data_subject_requests")
      .update({
        status: "completed",
        assigned_to: assignedTo,
        response_data: userData,
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestId)

    if (updateError) throw updateError

    await this.complianceLogger.logAction({
      organization_id: request.organization_id,
      user_id: assignedTo,
      action: "gdpr_access_request_processed",
      resource_type: "data_subject_request",
      resource_id: requestId,
      compliance_tags: ["gdpr", "right_to_access"],
    })

    return userData
  }

  async processDataErasureRequest(requestId: string, assignedTo: string): Promise<void> {
    const { data: request, error } = await this.supabase
      .from("data_subject_requests")
      .select("*")
      .eq("id", requestId)
      .single()

    if (error) throw error

    // Find user by email
    const { data: user } = await this.supabase.auth.admin.listUsers()
    const targetUser = user.users.find((u) => u.email === request.data_subject_email)

    if (targetUser) {
      // Anonymize or delete user data
      await this.anonymizeUserData(targetUser.id, request.organization_id)

      // Update request status
      await this.supabase
        .from("data_subject_requests")
        .update({
          status: "completed",
          assigned_to: assignedTo,
          completed_at: new Date().toISOString(),
        })
        .eq("id", requestId)

      await this.complianceLogger.logDataDeletion(assignedTo, "user_data", targetUser.id, {
        email: request.data_subject_email,
        reason: "gdpr_erasure_request",
      })
    }
  }

  async recordConsent(
    organizationId: string,
    dataSubjectId: string,
    processingPurpose: string,
    legalBasis: string,
    dataCategories: string[],
  ): Promise<void> {
    const { error } = await this.supabase.from("gdpr_data_processing").insert({
      organization_id: organizationId,
      data_subject_id: dataSubjectId,
      processing_purpose: processingPurpose,
      legal_basis: legalBasis,
      data_categories: dataCategories,
      consent_given: true,
      consent_date: new Date().toISOString(),
    })

    if (error) throw error

    await this.complianceLogger.logAction({
      organization_id: organizationId,
      user_id: dataSubjectId,
      action: "consent_recorded",
      resource_type: "gdpr_consent",
      new_values: { processing_purpose: processingPurpose, legal_basis: legalBasis },
      compliance_tags: ["gdpr", "consent"],
    })
  }

  async withdrawConsent(organizationId: string, dataSubjectId: string, processingPurpose: string): Promise<void> {
    const { error } = await this.supabase
      .from("gdpr_data_processing")
      .update({
        consent_withdrawn: true,
        consent_withdrawn_date: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("data_subject_id", dataSubjectId)
      .eq("processing_purpose", processingPurpose)

    if (error) throw error

    await this.complianceLogger.logAction({
      organization_id: organizationId,
      user_id: dataSubjectId,
      action: "consent_withdrawn",
      resource_type: "gdpr_consent",
      new_values: { processing_purpose: processingPurpose },
      compliance_tags: ["gdpr", "consent_withdrawal"],
    })
  }

  private async collectUserData(email: string, organizationId: string): Promise<any> {
    // Collect data from all relevant tables
    const userData: any = {}

    // User profile data
    const { data: user } = await this.supabase.auth.admin.listUsers()
    const targetUser = user.users.find((u) => u.email === email)

    if (targetUser) {
      userData.profile = {
        id: targetUser.id,
        email: targetUser.email,
        created_at: targetUser.created_at,
        last_sign_in_at: targetUser.last_sign_in_at,
        user_metadata: targetUser.user_metadata,
      }

      // Workflows
      const { data: workflows } = await this.supabase
        .from("workflows")
        .select("*")
        .eq("user_id", targetUser.id)
        .eq("organization_id", organizationId)

      userData.workflows = workflows

      // Integrations
      const { data: integrations } = await this.supabase.from("integrations").select("*").eq("user_id", targetUser.id)

      userData.integrations = integrations

      // Audit logs
      const { data: auditLogs } = await this.supabase
        .from("compliance_audit_logs")
        .select("*")
        .eq("user_id", targetUser.id)
        .eq("organization_id", organizationId)

      userData.audit_logs = auditLogs
    }

    return userData
  }

  private async anonymizeUserData(userId: string, organizationId: string): Promise<void> {
    // Anonymize workflows
    await this.supabase
      .from("workflows")
      .update({
        name: "Anonymized Workflow",
        description: "Data anonymized per GDPR request",
      })
      .eq("user_id", userId)
      .eq("organization_id", organizationId)

    // Delete integrations
    await this.supabase.from("integrations").delete().eq("user_id", userId)

    // Keep audit logs but anonymize personal data
    await this.supabase
      .from("compliance_audit_logs")
      .update({
        user_id: null,
        ip_address: null,
        user_agent: "Anonymized per GDPR request",
      })
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
  }
}
