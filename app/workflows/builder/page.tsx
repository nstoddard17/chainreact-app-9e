"use client"

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import CollaborativeWorkflowBuilder from "@/components/workflows/CollaborativeWorkflowBuilder"
import { ReactFlowProvider } from "@xyflow/react"

export default async function WorkflowBuilderPage() {
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  return (
    <ReactFlowProvider>
      <CollaborativeWorkflowBuilder />
    </ReactFlowProvider>
  )
}
