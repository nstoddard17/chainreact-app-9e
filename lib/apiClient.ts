import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

class ApiClient {
  private supabase: ReturnType<typeof createClient<Database>> | null = null

  constructor() {
    this.initializeSupabase()
  }

  private initializeSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables")
      return
    }

    this.supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
  }

  getSupabase() {
    if (!this.supabase) {
      throw new Error("Supabase client not initialized")
    }
    return this.supabase
  }

  async get(endpoint: string) {
    const response = await fetch(endpoint)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }

  async post(endpoint: string, data: any) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  }
}

export const apiClient = new ApiClient()
