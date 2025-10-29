import { notFound } from "next/navigation"
import { ReactFlowProvider } from "@xyflow/react"

import { WorkflowBuilderV2 } from "@/components/workflows/builder/WorkflowBuilderV2"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = "force-dynamic"

interface BuilderPageProps {
  params: Promise<{ id: string }>
}

export default async function FlowBuilderV2Page({ params }: BuilderPageProps) {
  await requireUsername()

  const { id: flowId } = await params

  const supabase = await createSupabaseServerClient()
  const repository = await getFlowRepository(supabase)
  const revision = await repository.loadRevision({ flowId })

  if (!revision) {
    notFound()
  }

  return (
    <TooltipProvider>
      <ReactFlowProvider>
        <WorkflowBuilderV2 flowId={flowId} />
      </ReactFlowProvider>
    </TooltipProvider>
  )
}
