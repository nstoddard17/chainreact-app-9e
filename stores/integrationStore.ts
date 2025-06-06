import { create } from "zustand"
import type { Database } from "@/lib/db/database.types"

type IntegrationStore = {
  integrations: Database["public"]["Tables"]["integrations"]["Row"][]
  setIntegrations: (integrations: Database["public"]["Tables"]["integrations"]["Row"][]) => void
  addIntegration: (integration: Database["public"]["Tables"]["integrations"]["Row"]) => void
  updateIntegration: (integration: Database["public"]["Tables"]["integrations"]["Row"]) => void
  deleteIntegration: (id: string) => void
}

export const useIntegrationStore = create<IntegrationStore>((set) => ({
  integrations: [],
  setIntegrations: (integrations) => set({ integrations }),
  addIntegration: (integration) => set((state) => ({ integrations: [...state.integrations, integration] })),
  updateIntegration: (integration) =>
    set((state) => ({
      integrations: state.integrations.map((item) => (item.id === integration.id ? integration : item)),
    })),
  deleteIntegration: (id) =>
    set((state) => ({
      integrations: state.integrations.filter((item) => item.id !== id),
    })),
}))
