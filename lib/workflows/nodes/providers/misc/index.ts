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
    },
    {
      name: "saleType",
      label: "Sale Type",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Sales" },
        { value: "one_time", label: "One-Time Purchases Only" },
        { value: "subscription", label: "Subscription Purchases Only" }
      ],
      placeholder: "All Sales",
      tooltip: "Filter by whether the sale is a one-time purchase or initial subscription purchase. Uses subscriptionId field.",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "countries",
      label: "Countries",
      type: "multi-select",
      required: false,
      options: [
        { value: "US", label: "United States" },
        { value: "GB", label: "United Kingdom" },
        { value: "CA", label: "Canada" },
        { value: "AU", label: "Australia" },
        { value: "DE", label: "Germany" },
        { value: "FR", label: "France" },
        { value: "ES", label: "Spain" },
        { value: "IT", label: "Italy" },
        { value: "NL", label: "Netherlands" },
        { value: "BR", label: "Brazil" },
        { value: "MX", label: "Mexico" },
        { value: "IN", label: "India" },
        { value: "JP", label: "Japan" },
        { value: "KR", label: "South Korea" },
        { value: "SG", label: "Singapore" }
      ],
      placeholder: "All Countries",
      tooltip: "Only trigger for sales from specific countries (based on IP address). Leave empty for all countries.",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "offerCodeRequired",
      label: "Offer Code",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Sales" },
        { value: "with_code", label: "With Offer Code" },
        { value: "without_code", label: "Without Offer Code" }
      ],
      placeholder: "All Sales",
      tooltip: "Filter by whether buyer used a discount/offer code",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "marketingOptIn",
      label: "Marketing Opt-In",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Buyers" },
        { value: "opted_in", label: "Opted In Only" },
        { value: "opted_out", label: "Opted Out Only" }
      ],
      placeholder: "All Buyers",
      tooltip: "Filter by whether buyer opted in to receive marketing emails (canContact field)",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "currencies",
      label: "Currencies",
      type: "multi-select",
      required: false,
      options: [
        { value: "USD", label: "US Dollar (USD)" },
        { value: "EUR", label: "Euro (EUR)" },
        { value: "GBP", label: "British Pound (GBP)" },
        { value: "CAD", label: "Canadian Dollar (CAD)" },
        { value: "AUD", label: "Australian Dollar (AUD)" },
        { value: "JPY", label: "Japanese Yen (JPY)" },
        { value: "INR", label: "Indian Rupee (INR)" },
        { value: "BRL", label: "Brazilian Real (BRL)" },
        { value: "MXN", label: "Mexican Peso (MXN)" },
        { value: "CHF", label: "Swiss Franc (CHF)" },
        { value: "CNY", label: "Chinese Yuan (CNY)" },
        { value: "SGD", label: "Singapore Dollar (SGD)" },
        { value: "NZD", label: "New Zealand Dollar (NZD)" },
        { value: "KRW", label: "South Korean Won (KRW)" }
      ],
      placeholder: "All Currencies",
      tooltip: "Filter by transaction currency. Leave empty for all currencies. Useful for routing sales to region-specific fulfillment teams.",
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
    },
    {
      name: "subscriptionType",
      label: "Subscription Type",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Subscribers" },
        { value: "new", label: "New Subscribers Only" },
        { value: "renewal", label: "Renewals Only" }
      ],
      placeholder: "All Subscribers",
      tooltip: "Filter by first-time subscribers vs recurring renewals. Uses charge_occurrence_count: 1=new, 2+=renewal",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "subscriptionPlans",
      label: "Subscription Plans",
      type: "multi-select",
      required: false,
      options: [
        { value: "monthly", label: "Monthly" },
        { value: "quarterly", label: "Quarterly" },
        { value: "biannually", label: "Biannually (6 months)" },
        { value: "yearly", label: "Yearly" },
        { value: "every_two_years", label: "Every 2 Years" }
      ],
      placeholder: "All Plans",
      tooltip: "Filter by subscription duration/billing interval. Leave empty to trigger on all billing periods.",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "minimumChargeCount",
      label: "Minimum Charge Count",
      type: "number",
      required: false,
      placeholder: "1",
      tooltip: "Only trigger after N charges (e.g., 3 = third renewal onwards). Useful for loyalty programs or long-term subscriber rewards.",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "freeTrialStatus",
      label: "Free Trial Status",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Subscribers" },
        { value: "with_trial", label: "With Free Trial" },
        { value: "no_trial", label: "No Free Trial" }
      ],
      placeholder: "All Subscribers",
      tooltip: "Filter by whether subscriber used a free trial when signing up",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "minimumAmount",
      label: "Minimum Subscription Amount",
      type: "number",
      required: false,
      placeholder: "0",
      tooltip: "Only trigger when subscription amount is greater than or equal to this value (in cents). Useful for VIP onboarding.",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "maximumAmount",
      label: "Maximum Subscription Amount",
      type: "number",
      required: false,
      placeholder: "No limit",
      tooltip: "Only trigger when subscription amount is less than or equal to this value (in cents)",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "currencies",
      label: "Currencies",
      type: "multi-select",
      required: false,
      options: [
        { value: "USD", label: "US Dollar (USD)" },
        { value: "EUR", label: "Euro (EUR)" },
        { value: "GBP", label: "British Pound (GBP)" },
        { value: "CAD", label: "Canadian Dollar (CAD)" },
        { value: "AUD", label: "Australian Dollar (AUD)" },
        { value: "JPY", label: "Japanese Yen (JPY)" },
        { value: "INR", label: "Indian Rupee (INR)" },
        { value: "BRL", label: "Brazilian Real (BRL)" },
        { value: "MXN", label: "Mexican Peso (MXN)" },
        { value: "CHF", label: "Swiss Franc (CHF)" },
        { value: "CNY", label: "Chinese Yuan (CNY)" },
        { value: "SGD", label: "Singapore Dollar (SGD)" },
        { value: "NZD", label: "New Zealand Dollar (NZD)" },
        { value: "KRW", label: "South Korean Won (KRW)" }
      ],
      placeholder: "All Currencies",
      tooltip: "Filter by subscription currency. Leave empty for all currencies.",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
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
      name: "recurrence",
      label: "Recurrence",
      type: "string",
      description: "Subscription billing interval: monthly, quarterly, biannually, yearly, or every_two_years"
    },
    {
      name: "chargeOccurrenceCount",
      label: "Charge Occurrence Count",
      type: "number",
      description: "Number of charges made for this subscription. 1=new subscriber, 2+=renewal"
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
      name: "freeTrialEndsAt",
      label: "Free Trial Ends At",
      type: "string",
      description: "When the free trial ends (ISO 8601 format, if applicable)"
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
    },
    {
      name: "subscriptionPlans",
      label: "Subscription Plans",
      type: "multi-select",
      required: false,
      options: [
        { value: "monthly", label: "Monthly" },
        { value: "quarterly", label: "Quarterly" },
        { value: "biannually", label: "Biannually (6 months)" },
        { value: "yearly", label: "Yearly" },
        { value: "every_two_years", label: "Every 2 Years" }
      ],
      placeholder: "All Plans",
      tooltip: "Only trigger for cancellations of specific subscription plans",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "minimumChargesBeforeCancellation",
      label: "Minimum Charges Before Cancellation",
      type: "number",
      required: false,
      placeholder: "1",
      tooltip: "Only trigger if subscription had at least N successful charges before cancellation (loyalty metric)",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "maximumChargesBeforeCancellation",
      label: "Maximum Charges Before Cancellation",
      type: "number",
      required: false,
      placeholder: "No limit",
      tooltip: "Only trigger if subscription had at most N charges before cancellation (early churn detection)",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "refundStatus",
      label: "Refund Status",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Cancellations" },
        { value: "refunded", label: "With Refund" },
        { value: "no_refund", label: "Without Refund" }
      ],
      placeholder: "All Cancellations",
      tooltip: "Filter by whether a refund was issued upon cancellation",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "cancellationReason",
      label: "Cancellation Reason",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Reasons" },
        { value: "with_reason", label: "With Reason Provided" },
        { value: "no_reason", label: "No Reason Provided" }
      ],
      placeholder: "All Reasons",
      tooltip: "Filter by whether customer provided a cancellation reason",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "currencies",
      label: "Currencies",
      type: "multi-select",
      required: false,
      options: [
        { value: "USD", label: "US Dollar (USD)" },
        { value: "EUR", label: "Euro (EUR)" },
        { value: "GBP", label: "British Pound (GBP)" },
        { value: "CAD", label: "Canadian Dollar (CAD)" },
        { value: "AUD", label: "Australian Dollar (AUD)" },
        { value: "JPY", label: "Japanese Yen (JPY)" },
        { value: "INR", label: "Indian Rupee (INR)" },
        { value: "BRL", label: "Brazilian Real (BRL)" },
        { value: "MXN", label: "Mexican Peso (MXN)" },
        { value: "CHF", label: "Swiss Franc (CHF)" },
        { value: "CNY", label: "Chinese Yuan (CNY)" },
        { value: "SGD", label: "Singapore Dollar (SGD)" },
        { value: "NZD", label: "New Zealand Dollar (NZD)" },
        { value: "KRW", label: "South Korean Won (KRW)" }
      ],
      placeholder: "All Currencies",
      tooltip: "Filter by subscription currency. Leave empty for all currencies.",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
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
      name: "recurrence",
      label: "Recurrence",
      type: "string",
      description: "Subscription billing interval: monthly, quarterly, biannually, yearly, or every_two_years"
    },
    {
      name: "chargeOccurrenceCount",
      label: "Charge Occurrence Count",
      type: "number",
      description: "Number of successful charges before cancellation. Useful for calculating subscription lifetime."
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
    },
    {
      name: "refundType",
      label: "Refund Type",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Refunds" },
        { value: "full", label: "Full Refunds Only" },
        { value: "partial", label: "Partial Refunds Only" }
      ],
      placeholder: "All Refunds",
      tooltip: "Filter by whether the refund is full or partial. Uses isPartialRefund field.",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "minimumRefundAmount",
      label: "Minimum Refund Amount",
      type: "number",
      required: false,
      placeholder: "0",
      tooltip: "Only trigger when refund amount is greater than or equal to this value (in cents)",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "maximumRefundAmount",
      label: "Maximum Refund Amount",
      type: "number",
      required: false,
      placeholder: "No limit",
      tooltip: "Only trigger when refund amount is less than or equal to this value (in cents)",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "maxDaysSincePurchase",
      label: "Maximum Days Since Purchase",
      type: "number",
      required: false,
      placeholder: "No limit",
      tooltip: "Only trigger if refund occurred within N days of original purchase (e.g., 30 = refunds within 30 days)",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "refundReason",
      label: "Refund Reason",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Refunds" },
        { value: "with_reason", label: "With Reason Provided" },
        { value: "no_reason", label: "No Reason Provided" }
      ],
      placeholder: "All Refunds",
      tooltip: "Filter by whether a refund reason was provided",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "subscriptionRefund",
      label: "Subscription Refund",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Refunds" },
        { value: "subscription_only", label: "Subscription Refunds Only" },
        { value: "non_subscription", label: "Non-Subscription Refunds Only" }
      ],
      placeholder: "All Refunds",
      tooltip: "Filter by whether the refunded sale was a subscription or one-time purchase",
      dependsOn: "product",
      hidden: {
        $deps: ["product"],
        $condition: { product: { $exists: false } }
      }
    },
    {
      name: "currencies",
      label: "Currencies",
      type: "multi-select",
      required: false,
      options: [
        { value: "USD", label: "US Dollar (USD)" },
        { value: "EUR", label: "Euro (EUR)" },
        { value: "GBP", label: "British Pound (GBP)" },
        { value: "CAD", label: "Canadian Dollar (CAD)" },
        { value: "AUD", label: "Australian Dollar (AUD)" },
        { value: "JPY", label: "Japanese Yen (JPY)" },
        { value: "INR", label: "Indian Rupee (INR)" },
        { value: "BRL", label: "Brazilian Real (BRL)" },
        { value: "MXN", label: "Mexican Peso (MXN)" },
        { value: "CHF", label: "Swiss Franc (CHF)" },
        { value: "CNY", label: "Chinese Yuan (CNY)" },
        { value: "SGD", label: "Singapore Dollar (SGD)" },
        { value: "NZD", label: "New Zealand Dollar (NZD)" },
        { value: "KRW", label: "South Korean Won (KRW)" }
      ],
      placeholder: "All Currencies",
      tooltip: "Filter by refund currency. Leave empty for all currencies.",
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
    },
    {
      name: "currencies",
      label: "Currencies",
      type: "multi-select",
      required: false,
      options: [
        { value: "USD", label: "US Dollar (USD)" },
        { value: "EUR", label: "Euro (EUR)" },
        { value: "GBP", label: "British Pound (GBP)" },
        { value: "CAD", label: "Canadian Dollar (CAD)" },
        { value: "AUD", label: "Australian Dollar (AUD)" },
        { value: "JPY", label: "Japanese Yen (JPY)" },
        { value: "CHF", label: "Swiss Franc (CHF)" },
        { value: "CNY", label: "Chinese Yuan (CNY)" },
        { value: "INR", label: "Indian Rupee (INR)" },
        { value: "BRL", label: "Brazilian Real (BRL)" },
        { value: "MXN", label: "Mexican Peso (MXN)" },
        { value: "SEK", label: "Swedish Krona (SEK)" },
        { value: "NZD", label: "New Zealand Dollar (NZD)" },
        { value: "SGD", label: "Singapore Dollar (SGD)" }
      ],
      placeholder: "All Currencies",
      tooltip: "Filter analytics by specific currencies. Leave empty to include all currencies."
    },
    {
      name: "saleType",
      label: "Sale Type",
      type: "select",
      required: false,
      options: [
        { value: "all", label: "All Sales" },
        { value: "one_time", label: "One-Time Purchases Only" },
        { value: "subscription", label: "Subscriptions Only" }
      ],
      defaultValue: "all",
      placeholder: "All Sales",
      tooltip: "Filter analytics by sale type (one-time purchases vs subscriptions)"
    },
    {
      name: "includeBreakdown",
      label: "Include Breakdown",
      type: "toggle",
      required: false,
      defaultValue: false,
      tooltip: "Include detailed breakdowns by date, currency, and sale type in the output. This provides granular analytics data."
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
    },
    {
      name: "breakdown",
      label: "Breakdown",
      type: "array",
      description: "Daily or weekly breakdown of sales data (only included if includeBreakdown=true). Each entry contains: date, sales, revenue, refunds, netRevenue"
    },
    {
      name: "currencyBreakdown",
      label: "Currency Breakdown",
      type: "object",
      description: "Breakdown of sales and revenue by currency (only included if includeBreakdown=true). Keys are currency codes (USD, EUR, etc.), values contain: sales, revenue, netRevenue"
    },
    {
      name: "saleTypeBreakdown",
      label: "Sale Type Breakdown",
      type: "object",
      description: "Breakdown by one-time vs subscription sales (only included if includeBreakdown=true). Contains: oneTime (sales, revenue, avgValue), subscription (sales, revenue, avgValue)"
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
      name: "carrier",
      label: "Carrier",
      type: "select",
      required: false,
      options: [
        { value: "usps", label: "USPS" },
        { value: "ups", label: "UPS" },
        { value: "fedex", label: "FedEx" },
        { value: "dhl", label: "DHL" },
        { value: "amazon", label: "Amazon Logistics" },
        { value: "other", label: "Other" }
      ],
      placeholder: "Select carrier (optional)",
      tooltip: "Shipping carrier used for delivery"
    },
    {
      name: "trackingNumber",
      label: "Tracking Number",
      type: "text",
      required: false,
      placeholder: "Enter tracking number",
      tooltip: "Tracking number provided by the carrier"
    },
    {
      name: "trackingUrl",
      label: "Tracking URL",
      type: "text",
      required: false,
      placeholder: "https://www.example.com/tracking/123",
      tooltip: "Full tracking URL for the shipment"
    },
    {
      name: "shippingService",
      label: "Shipping Service",
      type: "select",
      required: false,
      options: [
        { value: "standard", label: "Standard" },
        { value: "express", label: "Express" },
        { value: "overnight", label: "Overnight" },
        { value: "international", label: "International" },
        { value: "priority", label: "Priority" }
      ],
      placeholder: "Select service (optional)",
      tooltip: "Type of shipping service used"
    },
    {
      name: "estimatedDeliveryDate",
      label: "Estimated Delivery Date",
      type: "date",
      required: false,
      tooltip: "Expected delivery date. Helps set customer expectations."
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
      name: "carrier",
      label: "Carrier",
      type: "string",
      description: "Shipping carrier used"
    },
    {
      name: "trackingNumber",
      label: "Tracking Number",
      type: "string",
      description: "Tracking number provided"
    },
    {
      name: "trackingUrl",
      label: "Tracking URL",
      type: "string",
      description: "Full tracking URL if provided"
    },
    {
      name: "shippingService",
      label: "Shipping Service",
      type: "string",
      description: "Type of shipping service used"
    },
    {
      name: "estimatedDeliveryDate",
      label: "Estimated Delivery Date",
      type: "string",
      description: "Expected delivery date (ISO 8601 format)"
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
    },
    {
      name: "refundReason",
      label: "Refund Reason",
      type: "select",
      required: false,
      options: [
        { value: "customer_request", label: "Customer Request" },
        { value: "product_issue", label: "Product Issue" },
        { value: "billing_error", label: "Billing Error" },
        { value: "duplicate_charge", label: "Duplicate Charge" },
        { value: "fraud", label: "Fraud" },
        { value: "other", label: "Other" }
      ],
      placeholder: "Select reason (optional)",
      tooltip: "Reason for issuing the refund. Important for compliance and analytics."
    },
    {
      name: "notifyCustomer",
      label: "Notify Customer",
      type: "checkbox",
      required: false,
      defaultValue: true,
      tooltip: "Send refund notification email to the customer"
    },
    {
      name: "internalNotes",
      label: "Internal Notes",
      type: "textarea",
      required: false,
      placeholder: "Add internal notes about this refund...",
      tooltip: "Internal notes for record keeping. Not visible to customer."
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
    },
    {
      name: "refundReason",
      label: "Refund Reason",
      type: "string",
      description: "Reason provided for the refund"
    },
    {
      name: "customerNotified",
      label: "Customer Notified",
      type: "boolean",
      description: "Whether customer was notified of the refund"
    },
    {
      name: "internalNotes",
      label: "Internal Notes",
      type: "string",
      description: "Internal notes recorded with this refund"
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
      name: "minimumAmount",
      label: "Minimum Amount",
      type: "number",
      required: false,
      placeholder: "0",
      tooltip: "Only return sales with amount >= this value (in cents)"
    },
    {
      name: "maximumAmount",
      label: "Maximum Amount",
      type: "number",
      required: false,
      placeholder: "No limit",
      tooltip: "Only return sales with amount <= this value (in cents)"
    },
    {
      name: "saleType",
      label: "Sale Type",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Sales" },
        { value: "one_time", label: "One-Time Purchases" },
        { value: "subscription", label: "Subscription Purchases" }
      ],
      placeholder: "All Sales",
      tooltip: "Filter by purchase type"
    },
    {
      name: "countries",
      label: "Countries",
      type: "multi-select",
      required: false,
      options: [
        { value: "US", label: "United States" },
        { value: "GB", label: "United Kingdom" },
        { value: "CA", label: "Canada" },
        { value: "AU", label: "Australia" },
        { value: "DE", label: "Germany" },
        { value: "FR", label: "France" },
        { value: "ES", label: "Spain" },
        { value: "IT", label: "Italy" },
        { value: "NL", label: "Netherlands" },
        { value: "BR", label: "Brazil" },
        { value: "MX", label: "Mexico" },
        { value: "IN", label: "India" },
        { value: "JP", label: "Japan" },
        { value: "KR", label: "South Korea" },
        { value: "SG", label: "Singapore" }
      ],
      placeholder: "All Countries",
      tooltip: "Filter by buyer country (based on IP). Leave empty for all countries."
    },
    {
      name: "currencies",
      label: "Currencies",
      type: "multi-select",
      required: false,
      options: [
        { value: "USD", label: "US Dollar (USD)" },
        { value: "EUR", label: "Euro (EUR)" },
        { value: "GBP", label: "British Pound (GBP)" },
        { value: "CAD", label: "Canadian Dollar (CAD)" },
        { value: "AUD", label: "Australian Dollar (AUD)" },
        { value: "JPY", label: "Japanese Yen (JPY)" },
        { value: "INR", label: "Indian Rupee (INR)" },
        { value: "BRL", label: "Brazilian Real (BRL)" },
        { value: "MXN", label: "Mexican Peso (MXN)" },
        { value: "CHF", label: "Swiss Franc (CHF)" },
        { value: "CNY", label: "Chinese Yuan (CNY)" },
        { value: "SGD", label: "Singapore Dollar (SGD)" },
        { value: "NZD", label: "New Zealand Dollar (NZD)" },
        { value: "KRW", label: "South Korean Won (KRW)" }
      ],
      placeholder: "All Currencies",
      tooltip: "Filter by transaction currency. Leave empty for all currencies."
    },
    {
      name: "offerCodeStatus",
      label: "Offer Code",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Sales" },
        { value: "with_code", label: "With Offer Code" },
        { value: "without_code", label: "Without Offer Code" }
      ],
      placeholder: "All Sales",
      tooltip: "Filter by whether buyer used a discount code"
    },
    {
      name: "marketingOptIn",
      label: "Marketing Opt-In",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Buyers" },
        { value: "opted_in", label: "Opted In" },
        { value: "opted_out", label: "Opted Out" }
      ],
      placeholder: "All Buyers",
      tooltip: "Filter by marketing email consent"
    },
    {
      name: "refundStatus",
      label: "Refund Status",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All Sales" },
        { value: "refunded", label: "Refunded Only" },
        { value: "not_refunded", label: "Not Refunded" }
      ],
      placeholder: "All Sales",
      tooltip: "Filter by refund status"
    },
    {
      name: "sortOrder",
      label: "Sort Order",
      type: "select",
      required: false,
      defaultValue: "newest",
      options: [
        { value: "newest", label: "Newest First" },
        { value: "oldest", label: "Oldest First" },
        { value: "amount_high", label: "Amount: High to Low" },
        { value: "amount_low", label: "Amount: Low to High" }
      ],
      placeholder: "Newest First",
      tooltip: "Order to return results"
    },
    {
      name: "offset",
      label: "Offset",
      type: "number",
      required: false,
      defaultValue: 0,
      placeholder: "0",
      tooltip: "Number of results to skip (for pagination)"
    },
    {
      name: "limit",
      label: "Limit",
      type: "number",
      required: false,
      defaultValue: 50,
      placeholder: "50",
      tooltip: "Maximum number of sales to retrieve (default: 50, max: 100)"
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