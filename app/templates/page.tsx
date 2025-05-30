import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import TemplateMarketplace from "@/components/templates/TemplateMarketplace"

export default async function TemplatesPage() {
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  return <TemplateMarketplace session={session} />
}
