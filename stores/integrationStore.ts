import { create } from "zustand"
import type { Database } from "@/types/supabase"
import { supabase } from "@/lib/supabase"

type Integration = Database["public"]["Tables"]["integrations"]["Row"]

interface IntegrationState {
  integrations: Integration[]
  isLoading: boolean
  error: string | null
  fetchIntegrations: (userId: string) => Promise<void>
  createIntegration: (
    integrationData: Omit<Integration, "id" | "created_at" | "user_id">,
    userId: string,
  ) => Promise<void>
  updateIntegration: (id: string, updates: Partial<Omit<Integration, "id" | "created_at" | "user_id">>) => Promise<void>
  deleteIntegration: (id: string) => Promise<void>
}

export const useIntegrationStore = create<IntegrationState>((set) => ({
  integrations: [],
  isLoading: false,
  error: null,
  fetchIntegrations: async (userId: string) => {
    set({ isLoading: true, error: null })
    try {
      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const { data, error } = await supabase.from("integrations").select("*").eq("user_id", userId)

      if (error) {
        throw new Error(error.message)
      }

      set({ integrations: data || [], isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },
  createIntegration: async (integrationData: Omit<Integration, "id" | "created_at" | "user_id">, userId: string) => {
    set({ isLoading: true, error: null })
    try {
      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const { data, error } = await supabase
        .from("integrations")
        .insert([{ ...integrationData, user_id: userId }])
        .select()

      if (error) {
        throw new Error(error.message)
      }

      set((state) => ({
        integrations: [...state.integrations, data![0]],
        isLoading: false,
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },
  updateIntegration: async (id: string, updates: Partial<Omit<Integration, "id" | "created_at" | "user_id">>) => {
    set({ isLoading: true, error: null })
    try {
      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const { data, error } = await supabase.from("integrations").update(updates).eq("id", id).select()

      if (error) {
        throw new Error(error.message)
      }

      set((state) => ({
        integrations: state.integrations.map((integration) =>
          integration.id === id ? { ...integration, ...data![0] } : integration,
        ),
        isLoading: false,
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },
  deleteIntegration: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const { error } = await supabase.from("integrations").delete().eq("id", id)

      if (error) {
        throw new Error(error.message)
      }

      set((state) => ({
        integrations: state.integrations.filter((integration) => integration.id !== id),
        isLoading: false,
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },
}))
