import { randomUUID } from "crypto"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { ensureWorkspaceForUser } from "@/src/lib/workflows/builder/workspace"
import { createSupabaseServerActionClient, createSupabaseServerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

async function createFlow() {
  "use server"

  const supabase = await createSupabaseServerActionClient()
  const serviceClient = await createSupabaseServiceClient()
  const repository = await getFlowRepository(serviceClient)

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error("Authentication required")
  }

  const membership = await ensureWorkspaceForUser(serviceClient, user.id)

  const definitionId = randomUUID()
  const name = "Untitled Flow"

  await serviceClient
    .from("flow_v2_definitions")
    .insert({
      id: definitionId,
      name,
      workspace_id: membership.workspaceId,
      owner_id: user.id,
    })

  const flow = FlowSchema.parse({
    id: definitionId,
    name,
    version: 1,
    nodes: [],
    edges: [],
    trigger: { type: "manual", enabled: true },
    interface: { inputs: [], outputs: [] },
  })

  await repository.createRevision({ flowId: definitionId, flow, version: 1 })

  redirect(`/workflows/v2/${definitionId}`)
}

export default async function FlowListPage() {
  const supabase = await createSupabaseServerClient()

  const { data } = await supabase
    .from("flow_v2_definitions")
    .select("id, name, created_at")
    .order("created_at", { ascending: false })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Flow v2</h1>
          <p className="text-muted-foreground">Kadabra-style workflows with deterministic mapping</p>
        </div>
        <form action={createFlow}>
          <Button type="submit">New Flow v2</Button>
        </form>
      </div>

      <div className="grid gap-3">
        {(data ?? []).map((flow) => (
          <Link
            key={flow.id}
            href={`/workflows/v2/${flow.id}`}
            className="rounded-lg border bg-card p-4 transition hover:border-primary"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">{flow.name}</h2>
                <p className="text-sm text-muted-foreground">{new Date(flow.created_at ?? Date.now()).toLocaleString()}</p>
              </div>
              <span className="text-sm text-muted-foreground">Open builder →</span>
            </div>
          </Link>
        ))}
        {(!data || data.length === 0) && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            No Flow v2 definitions yet. Create your first workflow to get started.
          </div>
        )}
      </div>
    </div>
  )
}
