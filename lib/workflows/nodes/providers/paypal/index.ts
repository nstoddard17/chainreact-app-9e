import { NodeComponent } from "../../types"
import { ShoppingCart, Repeat, Send } from "lucide-react"

// PayPal Triggers
const paypalTriggerNewPayment: NodeComponent = {
  type: "paypal_trigger_new_payment",
  title: "New successful payment",
  description: "Triggers when a new successful payment is received",
  icon: ShoppingCart,
  providerId: "paypal",
  category: "Finance",
  isTrigger: true,
  comingSoon: true,
}

const paypalTriggerNewSubscription: NodeComponent = {
  type: "paypal_trigger_new_subscription",
  title: "New subscription created",
  description: "Triggers when a new subscription is created",
  icon: Repeat,
  providerId: "paypal",
  category: "Finance",
  isTrigger: true,
  comingSoon: true,
}

// PayPal Actions
const paypalActionCreateOrder: NodeComponent = {
  type: "paypal_action_create_order",
  title: "Create Order",
  description: "Create a new PayPal order",
  icon: ShoppingCart,
  providerId: "paypal",
  requiredScopes: ["openid"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    { name: "intent", label: "Intent", type: "select", required: true, defaultValue: "CAPTURE", options: [
      { value: "CAPTURE", label: "Capture" },
      { value: "AUTHORIZE", label: "Authorize" }
    ]},
    { name: "amount", label: "Amount", type: "number", required: true, placeholder: "10.00" },
    { name: "currency", label: "Currency", type: "select", required: true, defaultValue: "USD", options: [
      { value: "USD", label: "USD" },
      { value: "EUR", label: "EUR" },
      { value: "GBP", label: "GBP" }
    ]},
    { name: "description", label: "Description", type: "text", required: false, placeholder: "Order description" }
  ]
}

const paypalActionCreatePayout: NodeComponent = {
  type: "paypal_action_create_payout",
  title: "Create Payout",
  description: "Create a payout to a PayPal account",
  icon: Send,
  providerId: "paypal",
  requiredScopes: ["openid"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    { name: "email", label: "PayPal Email", type: "email", required: true, placeholder: "recipient@example.com" },
    { name: "amount", label: "Amount", type: "number", required: true, placeholder: "10.00" },
    { name: "currency", label: "Currency", type: "select", required: true, defaultValue: "USD", options: [
      { value: "USD", label: "USD" },
      { value: "EUR", label: "EUR" },
      { value: "GBP", label: "GBP" }
    ]},
    { name: "note", label: "Note", type: "text", required: false, placeholder: "Payout note" }
  ]
}

// Export all PayPal nodes
export const paypalNodes: NodeComponent[] = [
  // Triggers (2)
  paypalTriggerNewPayment,
  paypalTriggerNewSubscription,
  
  // Actions (2)
  paypalActionCreateOrder,
  paypalActionCreatePayout,
]