import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { z } from "zod"

import { FlowRepository } from "../repo"
import { registerDefaultNodes } from "../nodes/register"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { createSupabaseRunStore } from "../runner/execute"
import type { SupabaseClient } from "@supabase/supabase-js"

export async function getRouteClient(): Promise<SupabaseClient<any>> {
  return createSupabaseRouteHandlerClient()
}

export async function getServiceClient(): Promise<SupabaseClient<any>> {
  return createSupabaseServiceClient()
}

export async function getFlowRepository(client?: SupabaseClient<any>): Promise<FlowRepository> {
  const supabase = client ?? (await getServiceClient())
  return FlowRepository.create(supabase)
}

export async function ensureNodeRegistry() {
  registerDefaultNodes()
}

export function createRunStore(client: SupabaseClient<any>) {
  return createSupabaseRunStore(client)
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
