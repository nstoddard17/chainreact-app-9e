import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST(request: Request, { params }: { params: { workflowId: string } }) {
  const supabase = createRouteHandlerClient({ cookies })

  try {
    const workflowId = params.workflowId
    const body = await request.json()

    // Get workflow
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("status", "active")
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json({ error: "Workflow not found or inactive" }, { status: 404 })
    }

    // Check if workflow has webhook trigger
    const hasWebhookTrigger = workflow.nodes?.some((node: any) => node.data?.type === "webhook")

    if (!hasWebhookTrigger) {
      return NextResponse.json({ error: "Workflow does not have webhook trigger" }, { status: 400 })
    }

    // Execute workflow with webhook data
    const response = await fetch(`${request.url.split("/api/webhooks")[0]}/api/workflows/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflowId,
        inputData: {
          webhook: {
            headers: Object.fromEntries(request.headers.entries()),
            body,
            timestamp: new Date().toISOString(),
          },
        },
      }),
    })

    const result = await response.json()

    return NextResponse.json({
      success: true,
      message: "Webhook received and workflow triggered",
      executionId: result.executionId,
    })
  } catch (error) {
    console.error("Webhook processing error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}

export async function GET(request: Request, { params }: { params: { workflowId: string } }) {
  return NextResponse.json({
    message: "Webhook endpoint active",
    workflowId: params.workflowId,
    methods: ["POST"],
  })
}
