import { NextRequest, NextResponse } from "next/server"

import { executeHITL } from "@/lib/workflows/actions/hitl"
import type { HITLConfig } from "@/lib/workflows/actions/hitl/types"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

const TEST_WORKFLOW_NAME = "HITL Debug Harness"
const TEST_NODE_ID = "hitl-test-node"

export async function POST(request: NextRequest) {
  try {
    const supabaseClient = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const config = body?.config as HITLConfig | undefined
    const samplePayloadRaw = body?.samplePayload as string | undefined

    if (!config || config.channel !== "discord") {
      return NextResponse.json({ error: "Valid HITL config is required." }, { status: 400 })
    }

    if (!config.discordGuildId || !config.discordChannelId) {
      return NextResponse.json({ error: "Please select a Discord server and channel." }, { status: 400 })
    }

    const parsedPayload = parseSamplePayload(samplePayloadRaw)

    const serviceClient = await createSupabaseServiceClient()

    const workflowId = await ensureTestWorkflow(serviceClient, user.id)
    const executionId = await createTestExecution(serviceClient, workflowId, user.id, parsedPayload)

    const hitlConfig: HITLConfig = {
      channel: "discord",
      discordGuildId: config.discordGuildId,
      discordChannelId: config.discordChannelId,
      timeoutPreset: config.timeoutPreset ?? "60",
      timeout: config.timeout,
      timeoutAction: config.timeoutAction ?? "cancel",
      autoDetectContext: config.autoDetectContext ?? false,
      initialMessage: config.initialMessage,
      contextData: config.contextData,
      continuationSignals: config.continuationSignals?.length ? config.continuationSignals : undefined,
      extractVariables: config.extractVariables,
      enableMemory: config.enableMemory ?? "false",
    }

    const result = await executeHITL(hitlConfig, user.id, parsedPayload, {
      workflowId,
      nodeId: TEST_NODE_ID,
      executionId,
      testMode: true,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to start HITL." }, { status: 500 })
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to start HITL test." },
      { status: 500 }
    )
  }
}

function parseSamplePayload(raw?: string) {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { raw }
  }
}

async function ensureTestWorkflow(serviceClient: any, userId: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("workflows")
    .select("id")
    .eq("user_id", userId)
    .eq("name", TEST_WORKFLOW_NAME)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (data?.id) {
    return data.id
  }

  const nodes = [
    {
      id: TEST_NODE_ID,
      type: "hitl_conversation",
      data: {},
      position: { x: 0, y: 0 },
    },
  ]

  const insertResult = await serviceClient
    .from("workflows")
    .insert({
      name: TEST_WORKFLOW_NAME,
      description: "Auto-generated workflow used by the HITL debug harness.",
      user_id: userId,
      nodes,
      connections: [],
      status: "draft",
      visibility: "private",
    })
    .select("id")
    .single()

  if (insertResult.error) {
    throw insertResult.error
  }

  return insertResult.data.id
}

async function createTestExecution(serviceClient: any, workflowId: string, userId: string, triggerData: any) {
  const { data, error } = await serviceClient
    .from("workflow_executions")
    .insert({
      workflow_id: workflowId,
      user_id: userId,
      status: "running",
      trigger_data: triggerData,
      is_test_mode: true,
    })
    .select("id")
    .single()

  if (error) {
    throw error
  }

  return data.id
}
