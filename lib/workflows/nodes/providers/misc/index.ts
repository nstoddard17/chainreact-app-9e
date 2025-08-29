import { NodeComponent } from "../../types"
import {
  Mail,
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

// Resend Email Actions
const resendSendEmail: NodeComponent = {
  type: "resend_send_email",
  title: "Send Email",
  description: "Send professional emails using the Resend service with high deliverability.",
  icon: Mail,
  category: "Communication",
  isTrigger: false,
  producesOutput: true,
  configSchema: [
    { 
      name: "to", 
      label: "To", 
      type: "text", 
      required: true, 
      placeholder: "recipient@example.com or {{email_variable}}", 
      description: "Email recipient(s). Use variables like {{email}} for dynamic content.",
      hasVariablePicker: true
    }
  ]
}

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

// Beehiiv Nodes
const beehiivTriggerNewSubscriber: NodeComponent = {
  type: "beehiiv_trigger_new_subscriber",
  title: "New Subscriber",
  description: "Triggers when a new subscriber is added",
  icon: Users,
  providerId: "beehiiv",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  comingSoon: true,
}

const beehiivActionAddSubscriber: NodeComponent = {
  type: "beehiiv_action_add_subscriber",
  title: "Add Subscriber",
  description: "Add a new subscriber",
  icon: Plus,
  providerId: "beehiiv",
  category: "Communication",
  isTrigger: false,
}

const beehiivActionSendNewsletter: NodeComponent = {
  type: "beehiiv_action_send_newsletter",
  title: "Send Newsletter",
  description: "Send a newsletter to your subscribers",
  icon: Send,
  providerId: "beehiiv",
  category: "Communication",
  isTrigger: false,
}

// Blackbaud Nodes
const blackbaudTriggerNewDonor: NodeComponent = {
  type: "blackbaud_trigger_new_donor",
  title: "New Donor",
  description: "Triggers when a new donor is added to the system",
  icon: UserPlus,
  providerId: "blackbaud",
  category: "Other",
  isTrigger: true,
  comingSoon: true,
  configSchema: [
    { name: "constituentType", label: "Constituent Type", type: "select", required: false, options: [
      { value: "Individual", label: "Individual" },
      { value: "Organization", label: "Organization" }
    ]}
  ]
}

const blackbaudTriggerNewDonation: NodeComponent = {
  type: "blackbaud_trigger_new_donation",
  title: "New Donation",
  description: "Triggers when a new donation is received",
  icon: DollarSign,
  providerId: "blackbaud",
  category: "Other",
  isTrigger: true,
  comingSoon: true,
  configSchema: [
    { name: "minimumAmount", label: "Minimum Amount", type: "number", required: false, placeholder: "Minimum donation amount" },
    { name: "fundId", label: "Fund ID", type: "text", required: false, placeholder: "Specific fund ID to monitor" }
  ]
}

const blackbaudActionCreateConstituent: NodeComponent = {
  type: "blackbaud_action_create_constituent",
  title: "Create Constituent",
  description: "Create a new constituent in Blackbaud",
  icon: UserPlus,
  providerId: "blackbaud",
  requiredScopes: [],
  category: "Other",
  isTrigger: false,
  configSchema: [
    { name: "firstName", label: "First Name", type: "text", required: true, placeholder: "Enter first name" },
    { name: "lastName", label: "Last Name", type: "text", required: true, placeholder: "Enter last name" },
    { name: "email", label: "Email", type: "email", required: false, placeholder: "Enter email address" },
    { name: "phone", label: "Phone", type: "text", required: false, placeholder: "Enter phone number" },
    { name: "address", label: "Address", type: "textarea", required: false, placeholder: "Enter address" }
  ]
}

const blackbaudActionCreateDonation: NodeComponent = {
  type: "blackbaud_action_create_donation",
  title: "Create Donation",
  description: "Create a new donation record in Blackbaud",
  icon: DollarSign,
  providerId: "blackbaud",
  requiredScopes: [],
  category: "Other",
  isTrigger: false,
  configSchema: [
    { name: "constituentId", label: "Constituent ID", type: "text", required: true, placeholder: "Enter constituent ID" },
    { name: "amount", label: "Amount", type: "number", required: true, placeholder: "Enter donation amount" },
    { name: "fundId", label: "Fund ID", type: "text", required: false, placeholder: "Enter fund ID" },
    { name: "date", label: "Donation Date", type: "date", required: true },
    { name: "notes", label: "Notes", type: "textarea", required: false, placeholder: "Additional notes" }
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
  // Resend (1)
  resendSendEmail,
  
  // ManyChat (3)
  manychatTriggerNewSubscriber,
  manychatActionSendMessage,
  manychatActionTagSubscriber,
  
  // Beehiiv (3)
  beehiivTriggerNewSubscriber,
  beehiivActionAddSubscriber,
  beehiivActionSendNewsletter,
  
  // Blackbaud (4)
  blackbaudTriggerNewDonor,
  blackbaudTriggerNewDonation,
  blackbaudActionCreateConstituent,
  blackbaudActionCreateDonation,
  
  // Gumroad (4)
  gumroadTriggerNewSale,
  gumroadTriggerNewSubscriber,
  gumroadActionCreateProduct,
  gumroadActionGetSalesAnalytics,
]