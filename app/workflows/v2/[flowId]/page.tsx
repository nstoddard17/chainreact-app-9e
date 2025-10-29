import { notFound } from "next/navigation"

import { FlowBuilderClient } from "@/src/components/workflowsV2/FlowBuilderClient"
import { getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { getLatestPublishedRevision } from "@/src/lib/workflows/builder/publish"
import { createSupabaseServerClient } from "@/utils/supabase/server"

interface BuilderPageProps {
  params: Promise<{ flowId: string }>
}

export default async function FlowBuilderPage({ params }: BuilderPageProps) {
  const { flowId } = await params

  const supabase = await createSupabaseServerClient()
  const repository = await getFlowRepository(supabase)
  const revision = await repository.loadRevision({ flowId })

  if (!revision) {
    notFound()
  }

  const flow = FlowSchema.parse(revision.graph)
  const revisions = await repository.listRevisions(flowId)
  const publishedRevisionId = await getLatestPublishedRevision(flowId)

  return (
    <FlowBuilderClient
      initialFlow={flow}
      revisionId={revision.id}
      publishedRevisionId={publishedRevisionId}
      revisions={revisions}
    />
  )
}
