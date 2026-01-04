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
