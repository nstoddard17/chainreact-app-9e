import AppLayout from "@/components/layout/AppLayout"
import CustomWebhookManager from "@/components/webhooks/CustomWebhookManager"
import IntegrationWebhookManager from "@/components/webhooks/IntegrationWebhookManager"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Webhook, Zap } from "lucide-react"

export default function WebhooksPage() {
  return (
    <AppLayout 
      title="Webhooks" 
      subtitle="Manage custom webhooks and integration webhook URLs"
    >
      <Tabs defaultValue="custom" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="custom" className="flex items-center space-x-2">
            <Webhook className="w-4 h-4" />
            <span>Custom Webhooks</span>
          </TabsTrigger>
          <TabsTrigger value="integration" className="flex items-center space-x-2">
            <Zap className="w-4 h-4" />
            <span>Integration Webhooks</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="custom" className="mt-6">
          <CustomWebhookManager />
        </TabsContent>
        
        <TabsContent value="integration" className="mt-6">
          <IntegrationWebhookManager />
        </TabsContent>
      </Tabs>
    </AppLayout>
  )
} 