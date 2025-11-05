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
  outputSchema: [
    {
      name: "subscriberId",
      label: "Subscriber ID",
      type: "string",
      description: "Unique identifier for the new subscriber"
    },
    {
      name: "firstName",
      label: "First Name",
      type: "string",
      description: "Subscriber's first name"
    },
    {
      name: "lastName",
      label: "Last Name",
      type: "string",
      description: "Subscriber's last name"
    },
    {
      name: "email",
      label: "Email",
      type: "string",
      description: "Subscriber's email address"
    },
    {
      name: "phone",
      label: "Phone",
      type: "string",
      description: "Subscriber's phone number"
    },
    {
      name: "source",
      label: "Source",
      type: "string",
      description: "How the subscriber joined (e.g., widget, ad, landing page)"
    },
    {
      name: "tags",
      label: "Tags",
      type: "array",
      description: "Tags assigned to the subscriber"
    },
    {
      name: "subscribedAt",
      label: "Subscribed At",
      type: "string",
      description: "Timestamp when the subscriber was added (ISO 8601 format)"
    }
  ]
}

const manychatActionSendMessage: NodeComponent = {
  type: "manychat_action_send_message",
  title: "Send Message",
  description: "Send a message to a subscriber",
  icon: Send,
  providerId: "manychat",
  category: "Communication",
  isTrigger: false,
  comingSoon: true,
  configSchema: [
    { name: "subscriberId", label: "Subscriber ID", type: "text", required: true, placeholder: "Enter subscriber ID", description: "The ID of the subscriber to send the message to" },
    { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Enter your message", description: "The message text to send" },
    { name: "messageType", label: "Message Type", type: "select", required: false, defaultValue: "text", options: [
      { value: "text", label: "Text Message" },
      { value: "card", label: "Card" },
      { value: "gallery", label: "Gallery" }
    ]}
  ],
  outputSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "Unique identifier for the sent message"
    },
    {
      name: "subscriberId",
      label: "Subscriber ID",
      type: "string",
      description: "ID of the subscriber who received the message"
    },
    {
      name: "sentAt",
      label: "Sent At",
      type: "string",
      description: "Timestamp when the message was sent (ISO 8601 format)"
    },
    {
      name: "status",
      label: "Status",
      type: "string",
      description: "Delivery status (sent, delivered, read, failed)"
    }
  ]
}

const manychatActionTagSubscriber: NodeComponent = {
  type: "manychat_action_tag_subscriber",
  title: "Tag Subscriber",
  description: "Add a tag to a subscriber",
  icon: Edit,
  providerId: "manychat",
  category: "Communication",
  isTrigger: false,
  comingSoon: true,
  configSchema: [
    { name: "subscriberId", label: "Subscriber ID", type: "text", required: true, placeholder: "Enter subscriber ID", description: "The ID of the subscriber to tag" },
    { name: "tag", label: "Tag", type: "text", required: true, placeholder: "Enter tag name", description: "The tag to add to the subscriber" }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the tag was successfully added"
    },
    {
      name: "subscriberId",
      label: "Subscriber ID",
      type: "string",
      description: "ID of the tagged subscriber"
    },
    {
      name: "tag",
      label: "Tag",
      type: "string",
      description: "The tag that was added"
    },
    {
      name: "taggedAt",
      label: "Tagged At",
      type: "string",
      description: "Timestamp when the tag was added (ISO 8601 format)"
    }
  ]
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
  ],
  outputSchema: [
    {
      name: "saleId",
      label: "Sale ID",
      type: "string",
      description: "Unique identifier for the sale"
    },
    {
      name: "productId",
      label: "Product ID",
      type: "string",
      description: "ID of the product that was sold"
    },
    {
      name: "productName",
      label: "Product Name",
      type: "string",
      description: "Name of the product"
    },
    {
      name: "buyerEmail",
      label: "Buyer Email",
      type: "string",
      description: "Email address of the buyer"
    },
    {
      name: "buyerName",
      label: "Buyer Name",
      type: "string",
      description: "Full name of the buyer"
    },
    {
      name: "amount",
      label: "Sale Amount",
      type: "number",
      description: "Total sale amount in cents"
    },
    {
      name: "currency",
      label: "Currency",
      type: "string",
      description: "Currency code (USD, EUR, GBP, etc.)"
    },
    {
      name: "saleTimestamp",
      label: "Sale Timestamp",
      type: "string",
      description: "When the sale occurred (ISO 8601 format)"
    }
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
  ],
  outputSchema: [
    {
      name: "subscriptionId",
      label: "Subscription ID",
      type: "string",
      description: "Unique identifier for the subscription"
    },
    {
      name: "productId",
      label: "Product ID",
      type: "string",
      description: "ID of the subscribed product"
    },
    {
      name: "productName",
      label: "Product Name",
      type: "string",
      description: "Name of the product"
    },
    {
      name: "subscriberEmail",
      label: "Subscriber Email",
      type: "string",
      description: "Email address of the subscriber"
    },
    {
      name: "subscriberName",
      label: "Subscriber Name",
      type: "string",
      description: "Full name of the subscriber"
    },
    {
      name: "subscriptionPlan",
      label: "Subscription Plan",
      type: "string",
      description: "Subscription plan type (monthly, yearly, etc.)"
    },
    {
      name: "amount",
      label: "Subscription Amount",
      type: "number",
      description: "Subscription amount in cents"
    },
    {
      name: "subscribedAt",
      label: "Subscribed At",
      type: "string",
      description: "When the subscription started (ISO 8601 format)"
    }
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
  comingSoon: true,
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
  ],
  outputSchema: [
    {
      name: "productId",
      label: "Product ID",
      type: "string",
      description: "Unique identifier for the created product"
    },
    {
      name: "productUrl",
      label: "Product URL",
      type: "string",
      description: "Direct URL to the product page"
    },
    {
      name: "name",
      label: "Product Name",
      type: "string",
      description: "Name of the created product"
    },
    {
      name: "price",
      label: "Price",
      type: "number",
      description: "Product price in cents"
    },
    {
      name: "currency",
      label: "Currency",
      type: "string",
      description: "Currency code (USD, EUR, GBP)"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "When the product was created (ISO 8601 format)"
    }
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
  comingSoon: true,
  configSchema: [
    { name: "startDate", label: "Start Date", type: "date", required: true },
    { name: "endDate", label: "End Date", type: "date", required: true },
    { name: "productId", label: "Product ID", type: "text", required: false, placeholder: "Specific product ID (optional)" }
  ],
  outputSchema: [
    {
      name: "totalSales",
      label: "Total Sales",
      type: "number",
      description: "Total number of sales in the period"
    },
    {
      name: "totalRevenue",
      label: "Total Revenue",
      type: "number",
      description: "Total revenue in cents"
    },
    {
      name: "averageOrderValue",
      label: "Average Order Value",
      type: "number",
      description: "Average order value in cents"
    },
    {
      name: "totalRefunds",
      label: "Total Refunds",
      type: "number",
      description: "Number of refunds issued"
    },
    {
      name: "refundAmount",
      label: "Refund Amount",
      type: "number",
      description: "Total refund amount in cents"
    },
    {
      name: "netRevenue",
      label: "Net Revenue",
      type: "number",
      description: "Revenue after refunds in cents"
    },
    {
      name: "period",
      label: "Period",
      type: "object",
      description: "Date range analyzed (startDate, endDate)"
    }
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