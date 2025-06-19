import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import WorkflowBuilder from "@/components/workflows/WorkflowBuilder"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"

export default async function WorkflowBuilderPage() {
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  return <WorkflowBuilder />
}
