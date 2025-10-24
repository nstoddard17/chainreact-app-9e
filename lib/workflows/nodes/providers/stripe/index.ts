import {
  ShoppingCart,
  Users,
  UserPlus,
  CreditCard,
  Repeat,
  XCircle,
  AlertTriangle,
  FileText,
  Search
} from "lucide-react"
import { NodeComponent } from "../../types"

export const stripeNodes: NodeComponent[] = [
  {
    type: "stripe_trigger_new_payment",
    title: "New Payment",
    description: "Triggers on a new successful payment",
    icon: ShoppingCart,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
  },
  {
    type: "stripe_action_create_customer",
    title: "Create Customer",
    description: "Create a new customer",
    icon: Users,
    providerId: "stripe",
    requiredScopes: ["customer:write"],
    category: "Finance",
    isTrigger: false,
  },
  {
    type: "stripe_trigger_customer_created",
    title: "Customer Created",
    description: "Triggers when a new customer is created in Stripe",
    icon: UserPlus,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "customerId", label: "Customer ID", type: "string", description: "The unique ID of the created customer" },
      { name: "email", label: "Email", type: "string", description: "The customer's email address" },
      { name: "name", label: "Name", type: "string", description: "The customer's full name" },
      { name: "phone", label: "Phone", type: "string", description: "The customer's phone number" },
      { name: "created", label: "Created Date", type: "string", description: "When the customer was created" },
      { name: "metadata", label: "Metadata", type: "object", description: "Any custom metadata associated with the customer" }
    ],
  },
  {
    type: "stripe_trigger_payment_succeeded",
    title: "Payment Succeeded",
    description: "Triggers when a payment is completed successfully",
    icon: CreditCard,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "paymentIntentId", label: "Payment Intent ID", type: "string", description: "The unique ID of the payment intent" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who made the payment" },
      { name: "amount", label: "Amount", type: "number", description: "The payment amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "The payment currency (e.g., usd)" },
      { name: "status", label: "Status", type: "string", description: "The payment status" },
      { name: "created", label: "Created Date", type: "string", description: "When the payment was created" },
      { name: "metadata", label: "Metadata", type: "object", description: "Any custom metadata associated with the payment" }
    ],
  },
  {
    type: "stripe_trigger_subscription_created",
    title: "Subscription Created",
    description: "Triggers when a new subscription is created",
    icon: Repeat,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The unique ID of the subscription" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who subscribed" },
      { name: "status", label: "Status", type: "string", description: "The subscription status" },
      { name: "currentPeriodStart", label: "Current Period Start", type: "string", description: "Start of current billing period" },
      { name: "currentPeriodEnd", label: "Current Period End", type: "string", description: "End of current billing period" },
      { name: "planId", label: "Plan ID", type: "string", description: "The subscription plan ID" },
      { name: "created", label: "Created Date", type: "string", description: "When the subscription was created" }
    ],
  },
  {
    type: "stripe_trigger_subscription_deleted",
    title: "Subscription Cancelled",
    description: "Triggers when a subscription is cancelled",
    icon: XCircle,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The unique ID of the cancelled subscription" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer who cancelled" },
      { name: "status", label: "Status", type: "string", description: "The subscription status" },
      { name: "canceledAt", label: "Cancelled At", type: "string", description: "When the subscription was cancelled" },
      { name: "planId", label: "Plan ID", type: "string", description: "The subscription plan ID" },
      { name: "reason", label: "Cancellation Reason", type: "string", description: "Reason for cancellation if provided" }
    ],
  },
  {
    type: "stripe_trigger_invoice_payment_failed",
    title: "Invoice Payment Failed",
    description: "Triggers when a subscription payment fails",
    icon: AlertTriangle,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
    producesOutput: true,
    configSchema: [],
    outputSchema: [
      { name: "invoiceId", label: "Invoice ID", type: "string", description: "The unique ID of the failed invoice" },
      { name: "customerId", label: "Customer ID", type: "string", description: "The customer whose payment failed" },
      { name: "subscriptionId", label: "Subscription ID", type: "string", description: "The subscription with the failed payment" },
      { name: "amount", label: "Amount", type: "number", description: "The invoice amount in cents" },
      { name: "currency", label: "Currency", type: "string", description: "The invoice currency" },
      { name: "attemptCount", label: "Attempt Count", type: "number", description: "Number of payment attempts made" },
      { name: "nextPaymentAttempt", label: "Next Payment Attempt", type: "string", description: "When the next retry will occur" },
      { name: "failureReason", label: "Failure Reason", type: "string", description: "Reason for payment failure" }
    ],
  },
  {
    type: "stripe_action_create_payment_intent",
    title: "Create Payment Intent",
    description: "Create a new payment intent in Stripe",
    icon: CreditCard,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "amount", label: "Amount (cents)", type: "number", required: true, placeholder: "1000" },
      { name: "currency", label: "Currency", type: "select", required: true, defaultValue: "usd", options: [
        { value: "usd", label: "USD" },
        { value: "eur", label: "EUR" },
        { value: "gbp", label: "GBP" }
      ] },
      { name: "customerId", label: "Customer ID", type: "text", required: false, placeholder: "cus_1234567890" },
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Payment description" }
    ]
  },
  {
    type: "stripe_action_create_invoice",
    title: "Create Invoice",
    description: "Create a new invoice in Stripe",
    icon: FileText,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "customerId", label: "Customer ID", type: "text", required: true, placeholder: "cus_1234567890" },
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Invoice description" },
      { name: "autoAdvance", label: "Auto Advance", type: "boolean", required: false, defaultValue: true }
    ]
  },
  {
    type: "stripe_action_create_subscription",
    title: "Create Subscription",
    description: "Create a new subscription in Stripe",
    icon: Repeat,
    providerId: "stripe",
    requiredScopes: ["write"],
    category: "E-commerce",
    isTrigger: false,
    configSchema: [
      { name: "customerId", label: "Customer ID", type: "text", required: true, placeholder: "cus_1234567890" },
      { name: "priceId", label: "Price ID", type: "text", required: true, placeholder: "price_1234567890" },
      { name: "trialPeriodDays", label: "Trial Period (days)", type: "number", required: false, placeholder: "7" }
    ]
  },
  {
    type: "stripe_action_get_customers",
    title: "Get Customers",
    description: "Retrieve customers from Stripe with optional filtering",
    icon: Search,
    providerId: "stripe",
    requiredScopes: ["read"],
    category: "Finance",
    isTrigger: false,
    configSchema: [
      {
        name: "email",
        label: "Filter by Email (Optional)",
        type: "email",
        required: false,
        placeholder: "customer@example.com",
        description: "Filter customers by email address"
      },
      {
        name: "limit",
        label: "Maximum Results",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "Number of customers to retrieve (max 100)"
      },
      {
        name: "starting_after",
        label: "Starting After (Optional)",
        type: "text",
        required: false,
        placeholder: "cus_1234567890",
        tooltip: "Customer ID to start after for pagination. Use to retrieve the next page of results."
      }
    ],
    outputSchema: [
      {
        name: "customers",
        label: "Customers",
        type: "array",
        description: "Array of customers from Stripe"
      },
      {
        name: "count",
        label: "Count",
        type: "number",
        description: "Number of customers retrieved"
      }
    ]
  },
  {
    type: "stripe_action_get_payments",
    title: "Get Payments",
    description: "Retrieve payment intents from Stripe with optional filtering",
    icon: Search,
    providerId: "stripe",
    requiredScopes: ["read"],
    category: "Finance",
    isTrigger: false,
    configSchema: [
      {
        name: "customerId",
        label: "Filter by Customer (Optional)",
        type: "text",
        required: false,
        placeholder: "cus_1234567890",
        description: "Filter payments by customer ID"
      },
      {
        name: "limit",
        label: "Maximum Results",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "Number of payments to retrieve (max 100)"
      },
      {
        name: "status",
        label: "Filter by Status (Optional)",
        type: "select",
        required: false,
        options: [
          { value: "requires_payment_method", label: "Requires Payment Method" },
          { value: "requires_confirmation", label: "Requires Confirmation" },
          { value: "requires_action", label: "Requires Action" },
          { value: "processing", label: "Processing" },
          { value: "requires_capture", label: "Requires Capture" },
          { value: "canceled", label: "Canceled" },
          { value: "succeeded", label: "Succeeded" }
        ],
        tooltip: "Filter payments by their status"
      },
      {
        name: "starting_after",
        label: "Starting After (Optional)",
        type: "text",
        required: false,
        placeholder: "pi_1234567890",
        tooltip: "Payment intent ID to start after for pagination. Use to retrieve the next page of results."
      }
    ],
    outputSchema: [
      {
        name: "payments",
        label: "Payments",
        type: "array",
        description: "Array of payment intents from Stripe"
      },
      {
        name: "count",
        label: "Count",
        type: "number",
        description: "Number of payments retrieved"
      }
    ]
  },
]