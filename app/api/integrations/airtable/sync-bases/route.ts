import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { safeDecrypt } from "@/lib/security/encryption"
import { listAirtableBases } from "@/lib/integrations/airtable/api"

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const userId = body.userId as string | undefined
    if (!userId) {
      return errorResponse("Missing userId" , 400)
    }

    const { data: integ, error } = await supabase
      .from("integrations")
      .select("access_token, user_id, provider")
      .eq("user_id", userId)
      .eq("provider", "airtable")
      .single()
    if (error || !integ) {
      return errorResponse("Airtable integration not found" , 404)
    }

    // Use safeDecrypt which handles both encrypted and unencrypted tokens
    const accessToken = safeDecrypt(integ.access_token)

    const bases = await listAirtableBases(accessToken)

    // Upsert user_bases table (create if not present in migrations)
    await supabase.from("user_bases").upsert(
      bases.map((b) => ({ user_id: userId, provider: "airtable", base_id: b.id, name: b.name })),
      { onConflict: "user_id,provider,base_id" }
    )

    return jsonResponse({ success: true, count: bases.length, bases })
  } catch (e: any) {
    logger.error("sync airtable bases error:", e)
    return errorResponse(e.message || "Internal error" , 500)
  }
}


