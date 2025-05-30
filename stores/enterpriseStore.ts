import { create } from "zustand"
import type { SSOConfiguration } from "../lib/security/ssoProvider"
import type { DeploymentConfiguration } from "../lib/deployment/deploymentManager"
import type { EnterpriseIntegration } from "../lib/integrations/enterpriseIntegrations"

interface EnterpriseState {
  // SSO
  ssoConfigurations: SSOConfiguration[]
  activeSSOProvider: SSOConfiguration | null

  // Deployments
  deployments: DeploymentConfiguration[]
  activeDeployment: DeploymentConfiguration | null

  // Enterprise Integrations
  enterpriseIntegrations: EnterpriseIntegration[]

  // Compliance
  auditLogs: any[]
  gdprRequests: any[]

  // Loading states
  loading: {
    sso: boolean
    deployments: boolean
    integrations: boolean
    compliance: boolean
  }

  // Actions
  fetchSSOConfigurations: (organizationId: string) => Promise<void>
  createSSOConfiguration: (config: Partial<SSOConfiguration>) => Promise<void>
  updateSSOConfiguration: (id: string, config: Partial<SSOConfiguration>) => Promise<void>
  deleteSSOConfiguration: (id: string) => Promise<void>

  fetchDeployments: (organizationId: string) => Promise<void>
  createDeployment: (config: Partial<DeploymentConfiguration>) => Promise<void>
  updateDeployment: (id: string, config: Partial<DeploymentConfiguration>) => Promise<void>

  fetchEnterpriseIntegrations: (organizationId: string) => Promise<void>
  createEnterpriseIntegration: (integration: Partial<EnterpriseIntegration>) => Promise<void>
  updateEnterpriseIntegration: (id: string, integration: Partial<EnterpriseIntegration>) => Promise<void>

  fetchAuditLogs: (organizationId: string, filters?: any) => Promise<void>
  fetchGDPRRequests: (organizationId: string) => Promise<void>
  submitGDPRRequest: (request: any) => Promise<void>
}

export const useEnterpriseStore = create<EnterpriseState>((set, get) => ({
  // Initial state
  ssoConfigurations: [],
  activeSSOProvider: null,
  deployments: [],
  activeDeployment: null,
  enterpriseIntegrations: [],
  auditLogs: [],
  gdprRequests: [],
  loading: {
    sso: false,
    deployments: false,
    integrations: false,
    compliance: false,
  },

  // SSO Actions
  fetchSSOConfigurations: async (organizationId: string) => {
    set((state) => ({ loading: { ...state.loading, sso: true } }))
    try {
      const response = await fetch(`/api/enterprise/sso?organizationId=${organizationId}`)
      const data = await response.json()
      set({ ssoConfigurations: data, activeSSOProvider: data.find((config: any) => config.is_active) || null })
    } catch (error) {
      console.error("Failed to fetch SSO configurations:", error)
    } finally {
      set((state) => ({ loading: { ...state.loading, sso: false } }))
    }
  },

  createSSOConfiguration: async (config: Partial<SSOConfiguration>) => {
    try {
      const response = await fetch("/api/enterprise/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const newConfig = await response.json()
      set((state) => ({ ssoConfigurations: [...state.ssoConfigurations, newConfig] }))
    } catch (error) {
      console.error("Failed to create SSO configuration:", error)
      throw error
    }
  },

  updateSSOConfiguration: async (id: string, config: Partial<SSOConfiguration>) => {
    try {
      const response = await fetch(`/api/enterprise/sso/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const updatedConfig = await response.json()
      set((state) => ({
        ssoConfigurations: state.ssoConfigurations.map((c) => (c.id === id ? updatedConfig : c)),
        activeSSOProvider: updatedConfig.is_active ? updatedConfig : state.activeSSOProvider,
      }))
    } catch (error) {
      console.error("Failed to update SSO configuration:", error)
      throw error
    }
  },

  deleteSSOConfiguration: async (id: string) => {
    try {
      await fetch(`/api/enterprise/sso/${id}`, { method: "DELETE" })
      set((state) => ({
        ssoConfigurations: state.ssoConfigurations.filter((c) => c.id !== id),
        activeSSOProvider: state.activeSSOProvider?.id === id ? null : state.activeSSOProvider,
      }))
    } catch (error) {
      console.error("Failed to delete SSO configuration:", error)
      throw error
    }
  },

  // Deployment Actions
  fetchDeployments: async (organizationId: string) => {
    set((state) => ({ loading: { ...state.loading, deployments: true } }))
    try {
      const response = await fetch(`/api/enterprise/deployments?organizationId=${organizationId}`)
      const data = await response.json()
      set({ deployments: data, activeDeployment: data.find((d: any) => d.is_active) || null })
    } catch (error) {
      console.error("Failed to fetch deployments:", error)
    } finally {
      set((state) => ({ loading: { ...state.loading, deployments: false } }))
    }
  },

  createDeployment: async (config: Partial<DeploymentConfiguration>) => {
    try {
      const response = await fetch("/api/enterprise/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const newDeployment = await response.json()
      set((state) => ({ deployments: [...state.deployments, newDeployment] }))
    } catch (error) {
      console.error("Failed to create deployment:", error)
      throw error
    }
  },

  updateDeployment: async (id: string, config: Partial<DeploymentConfiguration>) => {
    try {
      const response = await fetch(`/api/enterprise/deployments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const updatedDeployment = await response.json()
      set((state) => ({
        deployments: state.deployments.map((d) => (d.id === id ? updatedDeployment : d)),
        activeDeployment: updatedDeployment.is_active ? updatedDeployment : state.activeDeployment,
      }))
    } catch (error) {
      console.error("Failed to update deployment:", error)
      throw error
    }
  },

  // Enterprise Integration Actions
  fetchEnterpriseIntegrations: async (organizationId: string) => {
    set((state) => ({ loading: { ...state.loading, integrations: true } }))
    try {
      const response = await fetch(`/api/enterprise/integrations?organizationId=${organizationId}`)
      const data = await response.json()
      set({ enterpriseIntegrations: data })
    } catch (error) {
      console.error("Failed to fetch enterprise integrations:", error)
    } finally {
      set((state) => ({ loading: { ...state.loading, integrations: false } }))
    }
  },

  createEnterpriseIntegration: async (integration: Partial<EnterpriseIntegration>) => {
    try {
      const response = await fetch("/api/enterprise/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integration),
      })
      const newIntegration = await response.json()
      set((state) => ({ enterpriseIntegrations: [...state.enterpriseIntegrations, newIntegration] }))
    } catch (error) {
      console.error("Failed to create enterprise integration:", error)
      throw error
    }
  },

  updateEnterpriseIntegration: async (id: string, integration: Partial<EnterpriseIntegration>) => {
    try {
      const response = await fetch(`/api/enterprise/integrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integration),
      })
      const updatedIntegration = await response.json()
      set((state) => ({
        enterpriseIntegrations: state.enterpriseIntegrations.map((i) => (i.id === id ? updatedIntegration : i)),
      }))
    } catch (error) {
      console.error("Failed to update enterprise integration:", error)
      throw error
    }
  },

  // Compliance Actions
  fetchAuditLogs: async (organizationId: string, filters?: any) => {
    set((state) => ({ loading: { ...state.loading, compliance: true } }))
    try {
      const queryParams = new URLSearchParams({ organizationId, ...filters })
      const response = await fetch(`/api/enterprise/audit-logs?${queryParams}`)
      const data = await response.json()
      set({ auditLogs: data })
    } catch (error) {
      console.error("Failed to fetch audit logs:", error)
    } finally {
      set((state) => ({ loading: { ...state.loading, compliance: false } }))
    }
  },

  fetchGDPRRequests: async (organizationId: string) => {
    try {
      const response = await fetch(`/api/enterprise/gdpr-requests?organizationId=${organizationId}`)
      const data = await response.json()
      set({ gdprRequests: data })
    } catch (error) {
      console.error("Failed to fetch GDPR requests:", error)
    }
  },

  submitGDPRRequest: async (request: any) => {
    try {
      const response = await fetch("/api/enterprise/gdpr-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      })
      const newRequest = await response.json()
      set((state) => ({ gdprRequests: [...state.gdprRequests, newRequest] }))
    } catch (error) {
      console.error("Failed to submit GDPR request:", error)
      throw error
    }
  },
}))
