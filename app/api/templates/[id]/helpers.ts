import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

interface TemplateAccessResult {
  supabase: ReturnType<typeof createSupabaseRouteHandlerClient> extends Promise<infer T> ? T : any
  user: any
  template: any
  errorResponse: NextResponse | null
  isAdmin: boolean
}

export async function requireTemplateAccess(templateId: string): Promise<TemplateAccessResult> {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      supabase,
      user: null,
      template: null,
      errorResponse: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      isAdmin: false,
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("Error fetching user profile for template access:", profileError)
  }

  const serviceClient = await createSupabaseServiceClient()

  const { data: template, error: templateError } = await serviceClient
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle()

  if (templateError) {
    console.error("Error fetching template for access check:", templateError)
  }

  if (!template) {
    return {
      supabase,
      user,
      template: null,
      errorResponse: NextResponse.json({ error: "Template not found" }, { status: 404 }),
      isAdmin: profile?.admin === true,
    }
  }

  const isAdmin = profile?.admin === true
  const createdBy =
    template?.created_by ??
    template?.user_id ??
    template?.owner_id ??
    template?.author_id ??
    null

  if (!isAdmin && createdBy !== user.id) {
    return {
      supabase,
      user,
      template: null,
      errorResponse: NextResponse.json({ error: "Only admins or template owners can manage templates" }, { status: 403 }),
      isAdmin,
    }
  }

  return { supabase, user, template, errorResponse: null, isAdmin }
}

export function parseJsonField<T = unknown>(field: unknown): T | null {
  if (typeof field === "string") {
    try {
      return JSON.parse(field) as T
    } catch (error) {
      console.error("Failed to parse template field", error)
      return null
    }
  }
  return (field as T) ?? null
}
