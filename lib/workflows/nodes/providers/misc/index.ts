import { NodeComponent } from "../../types"
import {
  Users,
  Send,
  Edit,
  Plus,
  UserPlus,
  UserX,
  DollarSign,
  ShoppingCart,
  BarChart,
  RotateCcw,
  Truck,
  Receipt
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
  requiredScopes: ["view_sales"],
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
  requiredScopes: ["view_sales"],
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
    },
    {
      name: "saleId",
      label: "Sale ID",
      type: "string",
      description: "ID of the sale that created this subscription"
    },
    {
      name: "status",
      label: "Subscription Status",
      type: "string",
      description: "Current subscription status (active, paused, cancelled)"
    },
    {
      name: "ended",
      label: "Subscription Ended",
      type: "boolean",
      description: "Whether the subscription has ended"
    },
    {
      name: "endedAt",
      label: "Ended At",
      type: "string",
      description: "When the subscription ended (ISO 8601 format, if applicable)"
    },
    {
      name: "cancelledAt",
      label: "Cancelled At",
      type: "string",
      description: "When the subscription was cancelled (ISO 8601 format, if applicable)"
    },
    {
      name: "failedAt",
      label: "Last Payment Failed At",
      type: "string",
      description: "When the last payment failed (ISO 8601 format, if applicable)"
    },
    {
      name: "currency",
      label: "Currency",
      type: "string",
      description: "Currency code (USD, EUR, GBP, etc.)"
    },
    {
      name: "customFields",
      label: "Custom Fields",
      type: "object",
      description: "Custom fields submitted with the subscription"
    },
    {
      name: "canContact",
      label: "Can Contact",
      type: "boolean",
      description: "Whether subscriber opted in to receive marketing emails"
    }
  ]
}

const gumroadTriggerSubscriptionCancelled: NodeComponent = {
  type: "gumroad_trigger_subscription_cancelled",
  title: "Subscription Cancelled",
  description: "Triggers when a subscription is cancelled on Gumroad",
  icon: UserX,
  providerId: "gumroad",
  category: "E-commerce",
  isTrigger: true,
  requiredScopes: ["view_sales"],
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
      tooltip: "Select a specific product to monitor cancellations for, or leave empty to trigger on all subscription cancellations. You can also use variables."
    }
  ],
  outputSchema: [
    {
      name: "subscriptionId",
      label: "Subscription ID",
      type: "string",
      description: "Unique identifier for the cancelled subscription"
    },
    {
      name: "productId",
      label: "Product ID",
      type: "string",
      description: "ID of the product"
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
      description: "Email address of the subscriber who cancelled"
    },
    {
      name: "subscriberName",
      label: "Subscriber Name",
      type: "string",
      description: "Full name of the subscriber"
    },
    {
      name: "cancelledAt",
      label: "Cancelled At",
      type: "string",
      description: "When the subscription was cancelled (ISO 8601 format)"
    },
    {
      name: "subscriptionStartDate",
      label: "Subscription Start Date",
      type: "string",
      description: "When the subscription originally started (ISO 8601 format)"
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
      name: "currency",
      label: "Currency",
      type: "string",
      description: "Currency code (USD, EUR, GBP, etc.)"
    },
    {
      name: "reason",
      label: "Cancellation Reason",
      type: "string",
      description: "Reason for cancellation (if provided by customer)"
    },
    {
      name: "refundAmount",
      label: "Refund Amount",
      type: "number",
      description: "Amount refunded upon cancellation in cents (if applicable)"
    },
    {
      name: "customFields",
      label: "Custom Fields",
      type: "object",
      description: "Custom fields associated with the subscription"
    }
  ]
}

const gumroadTriggerSaleRefunded: NodeComponent = {
  type: "gumroad_trigger_sale_refunded",
  title: "Sale Refunded",
  description: "Triggers when a sale is refunded on Gumroad",
  icon: RotateCcw,
  providerId: "gumroad",
  category: "E-commerce",
  isTrigger: true,
  requiredScopes: ["view_sales"],
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
      tooltip: "Select a specific product to monitor refunds for, or leave empty to trigger on all refunds. You can also use variables."
    }
  ],
  outputSchema: [
    {
      name: "saleId",
      label: "Sale ID",
      type: "string",
      description: "Unique identifier for the refunded sale"
    },
    {
      name: "productId",
      label: "Product ID",
      type: "string",
      description: "ID of the product that was refunded"
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
      name: "originalAmount",
      label: "Original Sale Amount",
      type: "number",
      description: "Original sale amount in cents"
    },
    {
      name: "refundAmount",
      label: "Refund Amount",
      type: "number",
      description: "Amount refunded in cents"
    },
    {
      name: "currency",
      label: "Currency",
      type: "string",
      description: "Currency code (USD, EUR, GBP, etc.)"
    },
    {
      name: "refundedAt",
      label: "Refunded At",
      type: "string",
      description: "When the refund was processed (ISO 8601 format)"
    },
    {
      name: "originalSaleDate",
      label: "Original Sale Date",
      type: "string",
      description: "When the original sale occurred (ISO 8601 format)"
    },
    {
      name: "refundReason",
      label: "Refund Reason",
      type: "string",
      description: "Reason for the refund (if provided)"
    },
    {
      name: "subscriptionId",
      label: "Subscription ID",
      type: "string",
      description: "Subscription ID if this was a subscription refund"
    },
    {
      name: "isPartialRefund",
      label: "Is Partial Refund",
      type: "boolean",
      description: "Whether this was a partial refund"
    },
    {
      name: "orderNumber",
      label: "Order Number",
      type: "number",
      description: "Sequential order number"
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

const gumroadActionMarkAsShipped: NodeComponent = {
  type: "gumroad_action_mark_as_shipped",
  title: "Mark Sale as Shipped",
  description: "Mark a sale as shipped and optionally add tracking information",
  icon: Truck,
  providerId: "gumroad",
  requiredScopes: ["mark_sales_as_shipped"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    {
      name: "saleId",
      label: "Sale ID",
      type: "text",
      required: true,
      placeholder: "Enter sale ID or use variable",
      tooltip: "The ID of the sale to mark as shipped"
    },
    {
      name: "trackingUrl",
      label: "Tracking URL",
      type: "text",
      required: false,
      placeholder: "https://www.example.com/tracking/123",
      tooltip: "Optional tracking URL for the shipment"
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the sale was successfully marked as shipped"
    },
    {
      name: "saleId",
      label: "Sale ID",
      type: "string",
      description: "ID of the sale that was marked as shipped"
    },
    {
      name: "trackingUrl",
      label: "Tracking URL",
      type: "string",
      description: "Tracking URL if provided"
    },
    {
      name: "markedAt",
      label: "Marked At",
      type: "string",
      description: "When the sale was marked as shipped (ISO 8601 format)"
    }
  ]
}

const gumroadActionRefundSale: NodeComponent = {
  type: "gumroad_action_refund_sale",
  title: "Refund Sale",
  description: "Refund a sale fully or partially",
  icon: RotateCcw,
  providerId: "gumroad",
  requiredScopes: ["refund_sales"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    {
      name: "saleId",
      label: "Sale ID",
      type: "text",
      required: true,
      placeholder: "Enter sale ID or use variable",
      tooltip: "The ID of the sale to refund"
    },
    {
      name: "amountCents",
      label: "Refund Amount (cents)",
      type: "number",
      required: false,
      placeholder: "Leave empty for full refund",
      tooltip: "Amount to refund in cents. Leave empty to refund the full amount."
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the refund was successful"
    },
    {
      name: "saleId",
      label: "Sale ID",
      type: "string",
      description: "ID of the refunded sale"
    },
    {
      name: "refundAmount",
      label: "Refund Amount",
      type: "number",
      description: "Amount refunded in cents"
    },
    {
      name: "originalAmount",
      label: "Original Amount",
      type: "number",
      description: "Original sale amount in cents"
    },
    {
      name: "isPartialRefund",
      label: "Is Partial Refund",
      type: "boolean",
      description: "Whether this was a partial refund"
    },
    {
      name: "refundedAt",
      label: "Refunded At",
      type: "string",
      description: "When the refund was processed (ISO 8601 format)"
    }
  ]
}

const gumroadActionListSales: NodeComponent = {
  type: "gumroad_action_list_sales",
  title: "List Sales",
  description: "Retrieve a list of sales with optional filters",
  icon: Receipt,
  providerId: "gumroad",
  requiredScopes: ["view_sales"],
  category: "E-commerce",
  isTrigger: false,
  configSchema: [
    {
      name: "startDate",
      label: "Start Date",
      type: "date",
      required: false,
      tooltip: "Filter sales from this date onwards"
    },
    {
      name: "endDate",
      label: "End Date",
      type: "date",
      required: false,
      tooltip: "Filter sales up to this date"
    },
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
      tooltip: "Filter by specific product, or leave empty for all products"
    },
    {
      name: "email",
      label: "Buyer Email",
      type: "text",
      required: false,
      placeholder: "buyer@example.com",
      tooltip: "Filter sales by buyer email address"
    },
    {
      name: "limit",
      label: "Limit",
      type: "number",
      required: false,
      defaultValue: 50,
      placeholder: "50",
      tooltip: "Maximum number of sales to retrieve (default: 50)"
    }
  ],
  outputSchema: [
    {
      name: "sales",
      label: "Sales",
      type: "array",
      description: "Array of sale objects matching the filters"
    },
    {
      name: "totalCount",
      label: "Total Count",
      type: "number",
      description: "Total number of sales matching the filters"
    },
    {
      name: "filters",
      label: "Filters Applied",
      type: "object",
      description: "Summary of filters that were applied"
    }
  ]
}

// Export all miscellaneous nodes
export const miscNodes: NodeComponent[] = [
  // ManyChat (3)
  manychatTriggerNewSubscriber,
  manychatActionSendMessage,
  manychatActionTagSubscriber,
  
  // Gumroad (8) - 4 triggers, 4 actions
  gumroadTriggerNewSale,
  gumroadTriggerNewSubscriber,
  gumroadTriggerSubscriptionCancelled,
  gumroadTriggerSaleRefunded,
  gumroadActionGetSalesAnalytics,
  gumroadActionMarkAsShipped,
  gumroadActionRefundSale,
  gumroadActionListSales,
]