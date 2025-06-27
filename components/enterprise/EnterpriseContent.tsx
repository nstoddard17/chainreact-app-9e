"use client"

import { useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Shield, Cloud, Database, Settings, Users } from "lucide-react"
import { useEnterpriseStore } from "@/stores/enterpriseStore"
import { SSOConfiguration } from "./SSOConfiguration"
import { DeploymentManagement } from "./DeploymentManagement"
import { EnterpriseIntegrations } from "./EnterpriseIntegrations"
import { ComplianceCenter } from "./ComplianceCenter"
import AppLayout from "@/components/layout/AppLayout"

export function EnterpriseContent() {
  const {
    ssoConfigurations,
    deployments,
    enterpriseIntegrations,
    loading,
    fetchSSOConfigurations,
    fetchDeployments,
    fetchEnterpriseIntegrations,
  } = useEnterpriseStore()

  useEffect(() => {
    // In a real app, get organization ID from context
    const organizationId = "demo-org-id"
    fetchSSOConfigurations(organizationId)
    fetchDeployments(organizationId)
    fetchEnterpriseIntegrations(organizationId)
  }, [fetchSSOConfigurations, fetchDeployments, fetchEnterpriseIntegrations])

  const enterpriseFeatures = [
    {
      icon: Shield,
      title: "Security & Compliance",
      description: "SOC 2, GDPR compliance with advanced audit logging",
      status: "Active",
      color: "green",
    },
    {
      icon: Cloud,
      title: "Deployment Options",
      description: "Cloud, on-premise, and private cloud deployments",
      status: deployments.length > 0 ? "Configured" : "Not Configured",
      color: deployments.length > 0 ? "green" : "yellow",
    },
    {
      icon: Database,
      title: "Enterprise Integrations",
      description: "Salesforce, Microsoft 365, ServiceNow, and custom APIs",
      status: `${enterpriseIntegrations.length} Connected`,
      color: enterpriseIntegrations.length > 0 ? "green" : "gray",
    },
    {
      icon: Users,
      title: "SSO Authentication",
      description: "SAML and OIDC single sign-on integration",
      status: ssoConfigurations.length > 0 ? "Enabled" : "Disabled",
      color: ssoConfigurations.length > 0 ? "green" : "red",
    },
  ]

  return (
    <AppLayout title="Enterprise">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Enterprise Dashboard</h1>
            <p className="text-muted-foreground">Manage enterprise-grade security, compliance, and deployment options</p>
          </div>
          <Button>
            <Settings className="w-4 h-4 mr-2" />
            Enterprise Settings
          </Button>
        </div>

        {/* Enterprise Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {enterpriseFeatures.map((feature, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{feature.title}</CardTitle>
                <feature.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">
                  <Badge variant={feature.color === "green" ? "default" : "secondary"}>{feature.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Enterprise Management Tabs */}
        <Tabs defaultValue="security" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="security">Security & SSO</TabsTrigger>
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>

          <TabsContent value="security" className="space-y-6">
            <SSOConfiguration />
          </TabsContent>

          <TabsContent value="deployments" className="space-y-6">
            <DeploymentManagement />
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <EnterpriseIntegrations />
          </TabsContent>

          <TabsContent value="compliance" className="space-y-6">
            <ComplianceCenter />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}
