import { randomUUID } from "crypto"

import { createSupabaseServiceClient } from "@/utils/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"

export async function publishRevision({
  flowId,
  revisionId,
  notes,
  publishedBy,
  client,
}: {
  flowId: string
  revisionId: string
  notes?: string
  publishedBy?: string
  client?: SupabaseClient<any>
}) {
  const supabase = client ?? (await createSupabaseServiceClient())

  await supabase
    .from("workflows_revisions")
    .update({ published: false })
    .eq("workflow_id", flowId)

  await supabase.from("workflows_revisions").update({
    published: true,
    published_at: new Date().toISOString(),
    published_by: publishedBy ?? null,
  }).eq("id", revisionId)

  await supabase.from("workflows_published_revisions").insert({
    id: randomUUID(),
    workflow_id: flowId,
    revision_id: revisionId,
    published_by: publishedBy ?? null,
    published_at: new Date().toISOString(),
    notes: notes ?? null,
  })
}

export async function getLatestPublishedRevision(
  flowId: string,
  client?: SupabaseClient<any>
) {
  const supabase = client ?? (await createSupabaseServiceClient())
  const { data } = await supabase
    .from("workflows_published_revisions")
    .select("revision_id")
    .eq("workflow_id", flowId)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.revision_id ?? null
}
