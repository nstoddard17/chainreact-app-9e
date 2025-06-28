import { Metadata } from "next"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import AIAssistantContent from "@/components/ai/AIAssistantContent"

export const metadata: Metadata = {
  title: "AI Assistant | ChainReact",
  description: "Intelligent AI assistant that can interact with all your connected integrations",
}

export default async function AIAssistantPage() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  return <AIAssistantContent />
} 