import { NodeComponent } from "../../types"
import {
  Users,
  Send,
  Edit,
  Plus,
  UserPlus,
  DollarSign,
  ShoppingCart,
  Package,
  BarChart
} from "lucide-react"

// ManyChat Nodes
const manychatTriggerNewSubscriber: NodeComponent = {
  type: "manychat_trigger_new_subscriber",
  title: "New Subscriber",
  description: "Triggers when a new subscriber is added",
  icon: Users,
  providerId: "manychat",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  comingSoon: true,
}

const manychatActionSendMessage: NodeComponent = {
  type: "manychat_action_send_message",
  title: "Send Message",
  description: "Send a message to a subscriber",
  icon: Send,
  providerId: "manychat",
  category: "Communication",
  isTrigger: false,
}

const manychatActionTagSubscriber: NodeComponent = {
  type: "manychat_action_tag_subscriber",
  title: "Tag Subscriber",
  description: "Add a tag to a subscriber",
  icon: Edit,
  providerId: "manychat",
  category: "Communication",
  isTrigger: false,
}

// Gumroad Nodes
const gumroadTriggerNewSale: NodeComponent = {
  type: "gumroad_trigger_new_sale",
  title: "New Sale",
  description: "Triggers when a new sale is made on Gumroad",
  icon: ShoppingCart,
  providerId: "gumroad",
  category: "E-commerce",
  isTrigger: true,
  comingSoon: true,
  configSchema: [
    { name: "productId", label: "Product ID", type: "text", required: false, placeholder: "Specific product ID to monitor" },
    { name: "minimumAmount", label: "Minimum Amount", type: "number", required: false, placeholder: "Minimum sale amount" }
  ]
}

const gumroadTriggerNewSubscriber: NodeComponent = {
  type: "gumroad_trigger_new_subscriber",
  title: "New Subscriber",
  description: "Triggers when someone subscribes to your Gumroad product",
  icon: UserPlus,
  providerId: "gumroad",
  category: "E-commerce",
  isTrigger: true,
  comingSoon: true,
  configSchema: [
    { name: "productId", label: "Product ID", type: "text", required: false, placeholder: "Specific product ID to monitor" }
  ]
}

const gumroadActionCreateProduct: NodeComponent = {
  type: "gumroad_action_create_product",
  title: "Create Product",
  description: "Create a new product on Gumroad",
  icon: Package,
  providerId: "gumroad",
  requiredScopes: ["edit_products"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    { name: "name", label: "Product Name", type: "text", required: true, placeholder: "Enter product name" },
    { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Product description" },
    { name: "price", label: "Price (cents)", type: "number", required: true, placeholder: "Price in cents (e.g., 1000 for $10)" },
    { name: "currency", label: "Currency", type: "select", required: true, defaultValue: "USD", options: [
      { value: "USD", label: "USD" },
      { value: "EUR", label: "EUR" },
      { value: "GBP", label: "GBP" }
    ]},
    { name: "productType", label: "Product Type", type: "select", required: true, defaultValue: "standard", options: [
      { value: "standard", label: "Standard" },
      { value: "subscription", label: "Subscription" }
    ]}
  ]
}

const gumroadActionGetSalesAnalytics: NodeComponent = {
  type: "gumroad_action_get_sales_analytics",
  title: "Get Sales Analytics",
  description: "Get sales analytics data from Gumroad",
  icon: BarChart,
  providerId: "gumroad",
  requiredScopes: ["view_sales"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    { name: "startDate", label: "Start Date", type: "date", required: true },
    { name: "endDate", label: "End Date", type: "date", required: true },
    { name: "productId", label: "Product ID", type: "text", required: false, placeholder: "Specific product ID (optional)" }
  ]
}

// Export all miscellaneous nodes
export const miscNodes: NodeComponent[] = [
  // ManyChat (3)
  manychatTriggerNewSubscriber,
  manychatActionSendMessage,
  manychatActionTagSubscriber,
  
  // Gumroad (4)
  gumroadTriggerNewSale,
  gumroadTriggerNewSubscriber,
  gumroadActionCreateProduct,
  gumroadActionGetSalesAnalytics,
]