import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import CustomWebhookManager from "@/components/webhooks/CustomWebhookManager"
import IntegrationWebhookManager from "@/components/webhooks/IntegrationWebhookManager"
import WebhookConfigurationPanel from "@/components/webhooks/WebhookConfigurationPanel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Webhook, Zap, Settings } from "lucide-react"

export default function WebhooksPage() {
  return (
    <NewAppLayout
      title="Webhooks"
      subtitle="Manage custom webhooks and integration webhook URLs"
    >
      <Tabs defaultValue="configuration" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="configuration" className="flex items-center space-x-2">
            <Settings className="w-4 h-4" />
            <span>Configuration</span>
          </TabsTrigger>
          <TabsTrigger value="custom" className="flex items-center space-x-2">
            <Webhook className="w-4 h-4" />
            <span>Custom Webhooks</span>
          </TabsTrigger>
          <TabsTrigger value="integration" className="flex items-center space-x-2">
            <Zap className="w-4 h-4" />
            <span>Integration Webhooks</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="configuration" className="mt-6">
          <WebhookConfigurationPanel />
        </TabsContent>
        
        <TabsContent value="custom" className="mt-6">
          <CustomWebhookManager />
        </TabsContent>
        
        <TabsContent value="integration" className="mt-6">
          <IntegrationWebhookManager />
        </TabsContent>
      </Tabs>
    </NewAppLayout>
  )
} 