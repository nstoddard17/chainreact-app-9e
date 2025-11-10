import { NodeComponent } from "../../types"
import {
  Users,
  Send,
  Edit,
  Plus,
  UserPlus,
  DollarSign,
  ShoppingCart,
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
    {
      name: "product",
      label: "Product",
      type: "combobox",
      dynamic: "gumroad_products",
      required: false,
      loadOnMount: true,
      searchable: true,
      placeholder: "All Products",
      emptyPlaceholder: "No products found",
      emptyMessage: "No products found. Create a product in your Gumroad account first.",
      tooltip: "Select a specific product to monitor, or leave empty to trigger on all sales. You can also use variables."
    },
    {
      name: "minimumAmount",
      label: "Minimum Sale Amount",
      type: "number",
      required: false,
      placeholder: "0",
      tooltip: "Only trigger when sale amount is greater than or equal to this value (in your account's default currency)",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "maximumAmount",
      label: "Maximum Sale Amount",
      type: "number",
      required: false,
      placeholder: "No limit",
      tooltip: "Only trigger when sale amount is less than or equal to this value (optional)",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    }
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
    },
    {
      name: "licenseKey",
      label: "License Key",
      type: "string",
      description: "License key for the product (if applicable)"
    },
    {
      name: "customFields",
      label: "Custom Fields",
      type: "object",
      description: "Custom fields submitted with the purchase"
    },
    {
      name: "variants",
      label: "Product Variants",
      type: "object",
      description: "Product variant options selected by the buyer"
    },
    {
      name: "offerCode",
      label: "Offer Code",
      type: "string",
      description: "Discount or offer code used for the purchase"
    },
    {
      name: "subscriptionId",
      label: "Subscription ID",
      type: "string",
      description: "Subscription ID if this is a subscription purchase"
    },
    {
      name: "refunded",
      label: "Refunded",
      type: "boolean",
      description: "Whether the sale has been refunded"
    },
    {
      name: "orderNumber",
      label: "Order Number",
      type: "number",
      description: "Sequential order number"
    },
    {
      name: "ipCountry",
      label: "IP Country",
      type: "string",
      description: "Buyer's country based on IP address (ISO country code)"
    },
    {
      name: "referrer",
      label: "Referrer",
      type: "string",
      description: "Page URL that referred the buyer to the purchase"
    },
    {
      name: "canContact",
      label: "Can Contact",
      type: "boolean",
      description: "Whether buyer opted in to receive marketing emails"
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
    {
      name: "product",
      label: "Product",
      type: "combobox",
      dynamic: "gumroad_products",
      required: false,
      loadOnMount: true,
      searchable: true,
      placeholder: "All Products",
      emptyPlaceholder: "No products found",
      emptyMessage: "No products found. Create a product in your Gumroad account first.",
      tooltip: "Select a specific product to monitor subscriptions for, or leave empty to trigger on all new subscribers. You can also use variables."
    }
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
    {
      name: "product",
      label: "Product",
      type: "combobox",
      dynamic: "gumroad_products",
      required: false,
      loadOnMount: true,
      searchable: true,
      placeholder: "All Products",
      emptyPlaceholder: "No products found",
      emptyMessage: "No products found. Create a product in your Gumroad account first.",
      tooltip: "Select a specific product to get analytics for, or leave empty for all products. You can also use variables."
    }
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
  
  // Gumroad (3)
  gumroadTriggerNewSale,
  gumroadTriggerNewSubscriber,
  gumroadActionGetSalesAnalytics,
]