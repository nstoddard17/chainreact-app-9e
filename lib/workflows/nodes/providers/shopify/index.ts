import { NodeComponent } from "../../types"
import {
  ShoppingCart,
  Plus,
  Edit,
  UserPlus
} from "lucide-react"

// Shopify Triggers
const shopifyTriggerNewOrder: NodeComponent = {
  type: "shopify_trigger_new_order",
  title: "New Order",
  description: "Triggers when a new order is placed",
  icon: ShoppingCart,
  providerId: "shopify",
  category: "eCommerce",
  isTrigger: true,
  comingSoon: true,
}

// Shopify Actions
const shopifyActionCreateProduct: NodeComponent = {
  type: "shopify_action_create_product",
  title: "Create Product",
  description: "Create a new product",
  icon: Plus,
  providerId: "shopify",
  requiredScopes: ["write_products"],
  category: "eCommerce",
  isTrigger: false,
}

const shopifyActionCreateOrder: NodeComponent = {
  type: "shopify_action_create_order",
  title: "Create Order",
  description: "Create a new order in Shopify",
  icon: ShoppingCart,
  providerId: "shopify",
  requiredScopes: ["write_orders"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    { name: "email", label: "Customer Email", type: "email", required: true, placeholder: "customer@example.com" },
    { name: "lineItems", label: "Line Items (JSON)", type: "textarea", required: true, placeholder: '[{"variant_id": 123, "quantity": 1}]' },
    { name: "financialStatus", label: "Financial Status", type: "select", required: false, defaultValue: "pending", options: [
      { value: "pending", label: "Pending" },
      { value: "paid", label: "Paid" },
      { value: "refunded", label: "Refunded" }
    ]},
    { name: "fulfillmentStatus", label: "Fulfillment Status", type: "select", required: false, defaultValue: "unfulfilled", options: [
      { value: "unfulfilled", label: "Unfulfilled" },
      { value: "fulfilled", label: "Fulfilled" }
    ]}
  ]
}

const shopifyActionUpdateProduct: NodeComponent = {
  type: "shopify_action_update_product",
  title: "Update Product",
  description: "Update an existing product in Shopify",
  icon: Edit,
  providerId: "shopify",
  requiredScopes: ["write_products"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    { name: "productId", label: "Product ID", type: "text", required: true, placeholder: "Enter product ID" },
    { name: "title", label: "Title", type: "text", required: false, placeholder: "New product title" },
    { name: "description", label: "Description", type: "textarea", required: false, placeholder: "New product description" },
    { name: "status", label: "Status", type: "select", required: false, options: [
      { value: "active", label: "Active" },
      { value: "draft", label: "Draft" },
      { value: "archived", label: "Archived" }
    ]}
  ]
}

const shopifyActionCreateCustomer: NodeComponent = {
  type: "shopify_action_create_customer",
  title: "Create Customer",
  description: "Create a new customer in Shopify",
  icon: UserPlus,
  providerId: "shopify",
  requiredScopes: ["write_customers"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    { name: "email", label: "Email", type: "email", required: true, placeholder: "customer@example.com" },
    { name: "firstName", label: "First Name", type: "text", required: false, placeholder: "John" },
    { name: "lastName", label: "Last Name", type: "text", required: false, placeholder: "Doe" },
    { name: "phone", label: "Phone", type: "text", required: false, placeholder: "+1-555-123-4567" },
    { name: "tags", label: "Tags", type: "text", required: false, placeholder: "vip,wholesale" }
  ]
}

// Export all Shopify nodes
export const shopifyNodes: NodeComponent[] = [
  // Triggers (1)
  shopifyTriggerNewOrder,
  
  // Actions (4)
  shopifyActionCreateProduct,
  shopifyActionCreateOrder,
  shopifyActionUpdateProduct,
  shopifyActionCreateCustomer,
]