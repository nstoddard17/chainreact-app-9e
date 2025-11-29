import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

export type WorkspaceRole = "viewer" | "editor" | "owner"

const ROLE_WEIGHT: Record<WorkspaceRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
}

export function roleMeetsRequirement(role: WorkspaceRole, required: WorkspaceRole) {
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[required]
}

export async function getWorkspaceRole(
  client: SupabaseClient<any>,
  workspaceId: string,
  userId: string
): Promise<WorkspaceRole | null> {
  if (!workspaceId) {
    return null
  }

  const { data, error } = await client
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (data?.role) {
    return normalizeRole(data.role)
  }

  const { data: workspace } = await client
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle()

  if (workspace?.owner_id === userId) {
    return "owner"
  }

  return null
}

export async function ensureWorkspaceRole(
  client: SupabaseClient<any>,
  workspaceId: string,
  userId: string,
  requiredRole: WorkspaceRole
) {
  const role = await getWorkspaceRole(client, workspaceId, userId)

  if (!role || !roleMeetsRequirement(role, requiredRole)) {
    const error = new Error("Forbidden")
    ;(error as any).status = 403
    throw error
  }

  return role
}

export async function resolveDefaultWorkspaceId(
  client: SupabaseClient<any>,
  userId: string
): Promise<{ workspaceId: string; role: WorkspaceRole } | null> {
  const { data, error } = await client
    .from("workspace_memberships")
    .select("workspace_id, role")
    .eq("user_id", userId)

  if (error) {
    throw new Error(error.message)
  }

  const memberships = (data ?? [])
    .map(({ workspace_id, role }) => ({
      workspaceId: workspace_id,
      role: normalizeRole(role),
    }))
    .filter((entry): entry is { workspaceId: string; role: WorkspaceRole } => Boolean(entry.workspaceId && entry.role))

  if (memberships.length === 0) {
    const { data: owned } = await client
      .from("workspaces")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle()

    if (owned?.id) {
      return { workspaceId: owned.id, role: "owner" }
    }

    return null
  }

  memberships.sort((a, b) => ROLE_WEIGHT[b.role] - ROLE_WEIGHT[a.role])
  return memberships[0]
}

function normalizeRole(role: string | null): WorkspaceRole {
  if (role === "owner" || role === "editor" || role === "viewer") {
    return role
  }
  return "viewer"
}

export async function ensureWorkspaceForUser(
  client: SupabaseClient<any>,
  userId: string
): Promise<{ workspaceId: string; role: WorkspaceRole }> {
  const { data: existingMembership, error: membershipError } = await client
    .from("workspace_memberships")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    if (membershipError.code === "42P01") {
      throw new Error("Workspace memberships not initialized. Run the latest Supabase migrations.")
    }
    throw membershipError
  }

  if (!membershipError && existingMembership?.workspace_id) {
    return {
      workspaceId: existingMembership.workspace_id,
      role: normalizeRole(existingMembership.role),
    }
  }

  const { data: ownedWorkspace, error: ownedError } = await client
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle()

  if (ownedError) {
    if (ownedError.code === "42P01") {
      throw new Error("Workspaces table not initialized. Run the latest Supabase migrations.")
    }
    if (ownedError.code !== "PGRST116") {
      throw ownedError
    }
  }

  const workspaceId = ownedWorkspace?.id ?? randomUUID()

  if (!ownedWorkspace) {
    await client.from("workspaces").insert({
      id: workspaceId,
      name: "Personal Workspace",
      slug: `workspace-${workspaceId.slice(0, 8)}`,
      owner_id: userId,
    })
  }

  const { error: membershipUpsertError } = await client.from("workspace_memberships").upsert({
    workspace_id: workspaceId,
    user_id: userId,
    role: "owner",
  })

  if (membershipUpsertError) {
    throw membershipUpsertError
  }

  return { workspaceId, role: "owner" }
}
