import { create } from "zustand"

interface IntegrationState {
  isConnected: boolean
  setConnected: (isConnected: boolean) => void
  integrationData: any
  setIntegrationData: (data: any) => void
  clearIntegrationData: () => void
}

const useIntegrationStore = create<IntegrationState>((set) => ({
  isConnected: false,
  setConnected: (isConnected) => set({ isConnected }),
  integrationData: null,
  setIntegrationData: (data) => set({ integrationData: data }),
  clearIntegrationData: () => set({ integrationData: null }),
}))

export default useIntegrationStore
