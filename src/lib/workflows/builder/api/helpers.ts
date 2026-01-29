import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { z } from "zod"

import { FlowRepository } from "../repo"
import { registerDefaultNodes } from "../nodes/register"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { createNoOpRunStore } from "../runner/execute"
import type { SupabaseClient } from "@supabase/supabase-js"

export async function getRouteClient(): Promise<SupabaseClient<any>> {
  return createSupabaseRouteHandlerClient()
}

export async function getServiceClient(): Promise<SupabaseClient<any>> {
  return createSupabaseServiceClient()
}

export async function getFlowRepository(
  client?: SupabaseClient<any>,
  options?: { allowServiceFallback?: boolean; fallbackClient?: SupabaseClient<any> }
): Promise<FlowRepository> {
  if (!client) {
    const service = await getServiceClient()
    return FlowRepository.create(service)
  }

  if (options?.allowServiceFallback) {
    const fallbackService = options.fallbackClient ?? (await getServiceClient())
    return FlowRepository.create(client, fallbackService)
  }

  return FlowRepository.create(client)
}

export async function ensureNodeRegistry() {
  registerDefaultNodes()
}

export function createRunStore() {
  return createNoOpRunStore()
}

export function uuid(): string {
  return randomUUID()
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export const InputsSchema = z.object({
  inputs: z.any().optional(),
  globals: z.record(z.any()).optional(),
})

/**
 * Check if a user has access to a workflow.
 * Uses service client to bypass RLS and performs explicit authorization checks.
 *
 * @param flowId - The workflow ID to check
 * @param userId - The user ID to check access for
 * @param requiredRole - Minimum role required (viewer, editor, admin). Owners always have access.
 * @returns Object with hasAccess boolean, workflow data, and optional error message
 */
export async function checkWorkflowAccess(
  flowId: string,
  userId: string,
  requiredRole: 'viewer' | 'editor' | 'admin' = 'viewer'
): Promise<{ hasAccess: boolean; workflow: { id: string; user_id: string; workspace_id: string | null; status: string } | null; error?: string }> {
  const serviceClient = await getServiceClient()

  const { data: workflow, error: workflowError } = await serviceClient
    .from("workflows")
    .select("id, user_id, workspace_id, status")
    .eq("id", flowId)
    .maybeSingle()

  if (workflowError) {
    return { hasAccess: false, workflow: null, error: workflowError.message }
  }

  if (!workflow) {
    return { hasAccess: false, workflow: null, error: "Flow not found" }
  }

  // Owner always has full access
  if (workflow.user_id === userId) {
    return { hasAccess: true, workflow }
  }

  // Check workspace membership
  if (workflow.workspace_id) {
    const { data: membership } = await serviceClient
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workflow.workspace_id)
      .eq("user_id", userId)
      .maybeSingle()

    if (membership) {
      const roleHierarchy: Record<string, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 }
      const userRoleLevel = roleHierarchy[membership.role] ?? -1
      const requiredRoleLevel = roleHierarchy[requiredRole] ?? 0

      if (userRoleLevel >= requiredRoleLevel) {
        return { hasAccess: true, workflow }
      }
    }
  }

  // Check shared permissions (workflow_permissions table)
  const { data: sharedAccess } = await serviceClient
    .from("workflow_permissions")
    .select("permission")
    .eq("workflow_id", flowId)
    .eq("user_id", userId)
    .maybeSingle()

  if (sharedAccess) {
    // Map permission to role level
    const permissionToRole: Record<string, string> = { view: 'viewer', edit: 'editor', admin: 'admin' }
    const equivalentRole = permissionToRole[sharedAccess.permission] ?? 'viewer'
    const roleHierarchy: Record<string, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 }
    const userRoleLevel = roleHierarchy[equivalentRole] ?? 0
    const requiredRoleLevel = roleHierarchy[requiredRole] ?? 0

    if (userRoleLevel >= requiredRoleLevel) {
      return { hasAccess: true, workflow }
    }
  }

  return { hasAccess: false, workflow, error: "Forbidden" }
}
