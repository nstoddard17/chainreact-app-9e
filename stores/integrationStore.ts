import { defineStore } from "pinia"

interface IntegrationState {
  isIntegrationEnabled: boolean
}

export const useIntegrationStore = defineStore("integration", {
  state: (): IntegrationState => ({
    isIntegrationEnabled: false,
  }),
  getters: {
    getIntegrationStatus: (state) => state.isIntegrationEnabled,
  },
  actions: {
    setIntegrationStatus(status: boolean) {
      this.isIntegrationEnabled = status
    },
  },
})
