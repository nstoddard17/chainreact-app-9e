import { ConnectorContract, ActionResult, ValidationResult } from './connector-contract'

/**
 * Capability-specific interfaces that providers can implement
 */

export interface EmailProvider extends ConnectorContract {
  sendMessage(params: EmailMessage): Promise<EmailResult>
  searchMessages(filters: EmailFilters): Promise<EmailMessage[]>
  getMessages(params: GetMessagesParams): Promise<EmailMessage[]>
  manageLabels(operation: LabelOperation): Promise<LabelResult>
  getContacts(filters?: ContactFilters): Promise<Contact[]>
}

export interface ChatProvider extends ConnectorContract {
  sendMessage(params: ChatMessage): Promise<ChatResult>
  editMessage(messageId: string, content: string): Promise<ChatResult>
  deleteMessage(messageId: string): Promise<void>
  createChannel(params: ChannelConfig): Promise<ChannelResult>
  manageMembers(operation: MemberOperation): Promise<MemberResult>
  getChannels(filters?: ChannelFilters): Promise<Channel[]>
  getMembers(channelId: string): Promise<Member[]>
}

export interface CalendarProvider extends ConnectorContract {
  createEvent(event: CalendarEvent): Promise<EventResult>
  updateEvent(eventId: string, updates: Partial<CalendarEvent>): Promise<EventResult>
  deleteEvent(eventId: string): Promise<void>
  getEvents(filters: EventFilters): Promise<CalendarEvent[]>
  getCalendars(): Promise<Calendar[]>
}

export interface FileProvider extends ConnectorContract {
  uploadFile(params: FileUpload): Promise<FileResult>
  downloadFile(fileId: string): Promise<FileContent>
  deleteFile(fileId: string): Promise<void>
  listFiles(filters?: FileFilters): Promise<FileInfo[]>
  createFolder(params: FolderConfig): Promise<FolderResult>
  shareFile(fileId: string, permissions: SharePermissions): Promise<ShareResult>
}

export interface CRMProvider extends ConnectorContract {
  createContact(contact: CRMContact): Promise<ContactResult>
  updateContact(contactId: string, updates: Partial<CRMContact>): Promise<ContactResult>
  deleteContact(contactId: string): Promise<void>
  getContacts(filters?: CRMFilters): Promise<CRMContact[]>
  createDeal(deal: Deal): Promise<DealResult>
  updateDeal(dealId: string, updates: Partial<Deal>): Promise<DealResult>
}

export interface ProjectProvider extends ConnectorContract {
  createProject(project: Project): Promise<ProjectResult>
  createTask(task: Task): Promise<TaskResult>
  updateTask(taskId: string, updates: Partial<Task>): Promise<TaskResult>
  moveTask(taskId: string, destination: TaskDestination): Promise<TaskResult>
  getProjects(filters?: ProjectFilters): Promise<Project[]>
  getTasks(filters?: TaskFilters): Promise<Task[]>
}

export interface DatabaseProvider extends ConnectorContract {
  createRecord(params: DatabaseRecord): Promise<DatabaseResult>
  updateRecord(params: DatabaseRecord): Promise<DatabaseResult>
  deleteRecord(params: DatabaseRecord): Promise<DatabaseResult>
  getRecords(filters?: RecordFilters): Promise<DatabaseRecord[]>
  getTables(filters?: TableFilters): Promise<Table[]>
  searchRecords(params: SearchParams): Promise<DatabaseRecord[]>
}

export interface SocialProvider extends ConnectorContract {
  createPost(params: SocialPost): Promise<SocialResult>
  deletePost(postId: string): Promise<void>
  likePost(postId: string): Promise<SocialResult>
  commentOnPost(postId: string, comment: string): Promise<SocialResult>
  getMentions(filters?: MentionFilters): Promise<SocialMention[]>
  getInsights(params: InsightsParams): Promise<InsightsResult>
  sendDirectMessage(params: DirectMessage): Promise<SocialResult>
}

export interface DevOpsProvider extends ConnectorContract {
  createRepository(params: Repository): Promise<RepositoryResult>
  createIssue(params: Issue): Promise<IssueResult>
  createPullRequest(params: PullRequest): Promise<PullRequestResult>
  getRepositories(filters?: RepoFilters): Promise<Repository[]>
  getIssues(filters?: IssueFilters): Promise<Issue[]>
  updateIssue(issueId: string, updates: Partial<Issue>): Promise<IssueResult>
}

export interface DocumentProvider extends ConnectorContract {
  createDocument(params: DocumentParams): Promise<DocumentResult>
  updateDocument(documentId: string, updates: DocumentUpdate): Promise<DocumentResult>
  deleteDocument(documentId: string): Promise<void>
  getDocument(documentId: string): Promise<DocumentInfo>
  getDocuments(filters?: DocumentFilters): Promise<DocumentInfo[]>
  shareDocument(documentId: string, permissions: SharePermissions): Promise<ShareResult>
  exportDocument(documentId: string, format: ExportFormat): Promise<DocumentExport>
}

export interface PaymentProvider extends ConnectorContract {
  createPayment(params: PaymentParams): Promise<PaymentResult>
  refundPayment(paymentId: string, amount?: number): Promise<RefundResult>
  getPayment(paymentId: string): Promise<PaymentInfo>
  getPayments(filters?: PaymentFilters): Promise<PaymentInfo[]>
  createCustomer(params: CustomerParams): Promise<CustomerResult>
  updateCustomer(customerId: string, updates: Partial<CustomerParams>): Promise<CustomerResult>
  getCustomer(customerId: string): Promise<CustomerInfo>
  createSubscription(params: SubscriptionParams): Promise<SubscriptionResult>
  cancelSubscription(subscriptionId: string): Promise<SubscriptionResult>
  getSubscriptions(filters?: SubscriptionFilters): Promise<SubscriptionInfo[]>
  createInvoice(params: InvoiceParams): Promise<InvoiceResult>
  getInvoices(filters?: InvoiceFilters): Promise<InvoiceInfo[]>
}

export interface EcommerceProvider extends ConnectorContract {
  createProduct(params: ProductParams): Promise<ProductResult>
  updateProduct(productId: string, updates: Partial<ProductParams>): Promise<ProductResult>
  getProduct(productId: string): Promise<ProductInfo>
  getProducts(filters?: ProductFilters): Promise<ProductInfo[]>
  createOrder(params: OrderParams): Promise<OrderResult>
  updateOrder(orderId: string, updates: Partial<OrderParams>): Promise<OrderResult>
  getOrder(orderId: string): Promise<OrderInfo>
  getOrders(filters?: OrderFilters): Promise<OrderInfo[]>
  updateInventory(productId: string, quantity: number): Promise<InventoryResult>
  getInventory(filters?: InventoryFilters): Promise<InventoryInfo[]>
}

// Email types
export interface EmailMessage {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  attachments?: Attachment[]
  metadata?: Record<string, any>
}

export interface EmailResult extends ActionResult {
  messageId?: string
  threadId?: string
}

export interface EmailFilters {
  from?: string
  to?: string
  subject?: string
  hasAttachment?: boolean
  labelIds?: string[]
  dateRange?: DateRange
  limit?: number
  pageToken?: string
}

export interface GetMessagesParams {
  labelIds?: string[]
  limit?: number
  pageToken?: string
  includeSpam?: boolean
}

export interface LabelOperation {
  type: 'add' | 'remove' | 'create' | 'delete'
  messageIds?: string[]
  labelIds?: string[]
  labelName?: string
}

export interface LabelResult extends ActionResult {
  labels?: Label[]
}

export interface Label {
  id: string
  name: string
  type: 'system' | 'user'
  messagesTotal?: number
  messagesUnread?: number
}

export interface Contact {
  id: string
  name: string
  email: string
  phone?: string
  metadata?: Record<string, any>
}

export interface ContactFilters {
  name?: string
  email?: string
  limit?: number
}

// Chat types
export interface ChatMessage {
  channelId: string
  content: string
  mentions?: string[]
  attachments?: Attachment[]
  threadId?: string
  metadata?: Record<string, any>
}

export interface ChatResult extends ActionResult {
  messageId?: string
  timestamp?: Date
}

export interface ChannelConfig {
  name: string
  description?: string
  private?: boolean
  members?: string[]
  metadata?: Record<string, any>
}

export interface ChannelResult extends ActionResult {
  channelId?: string
  name?: string
}

export interface MemberOperation {
  type: 'add' | 'remove' | 'update'
  channelId: string
  memberIds: string[]
  permissions?: Record<string, any>
}

export interface MemberResult extends ActionResult {
  members?: Member[]
}

export interface Channel {
  id: string
  name: string
  description?: string
  memberCount?: number
  private: boolean
  metadata?: Record<string, any>
}

export interface Member {
  id: string
  name: string
  email?: string
  role?: string
  joinedAt?: Date
}

export interface ChannelFilters {
  name?: string
  private?: boolean
  memberCount?: number
  limit?: number
}

// Common types
export interface Attachment {
  filename: string
  content: Buffer | string
  contentType: string
  size?: number
}

export interface DateRange {
  start: Date
  end: Date
}

// Calendar types (placeholder)
export interface CalendarEvent {
  id?: string
  title: string
  start: Date
  end: Date
  description?: string
}

export interface EventResult extends ActionResult {
  eventId?: string
}

export interface EventFilters {
  calendarId?: string
  dateRange?: DateRange
  limit?: number
}

export interface Calendar {
  id: string
  name: string
  primary?: boolean
}

// File types (placeholder)
export interface FileUpload {
  filename: string
  content: Buffer
  folderId?: string
}

export interface FileResult extends ActionResult {
  fileId?: string
  url?: string
}

export interface FileContent {
  content: Buffer
  metadata?: Record<string, any>
}

export interface FileInfo {
  id: string
  name: string
  size: number
  modifiedAt: Date
}

export interface FileFilters {
  folderId?: string
  name?: string
  limit?: number
}

export interface FolderConfig {
  name: string
  parentId?: string
}

export interface FolderResult extends ActionResult {
  folderId?: string
}

export interface SharePermissions {
  type: 'read' | 'write' | 'admin'
  users?: string[]
  public?: boolean
}

export interface ShareResult extends ActionResult {
  shareUrl?: string
}

// CRM types
export interface CRMContact {
  id?: string
  name: string
  email?: string
  phone?: string
  company?: string
  title?: string
  description?: string
  source?: string
  status?: string
  metadata?: Record<string, any>
}

export interface ContactResult extends ActionResult {
  contactId?: string
  name?: string
  email?: string
}

export interface Deal {
  id?: string
  title: string
  amount?: number
  stage?: string
  contactId?: string
  description?: string
  closeDate?: Date
  source?: string
  type?: string
  probability?: number
  metadata?: Record<string, any>
}

export interface DealResult extends ActionResult {
  dealId?: string
  title?: string
  amount?: number
}

export interface CRMFilters {
  company?: string
  email?: string
  limit?: number
}

// Project types (placeholder)
export interface Project {
  id?: string
  name: string
  description?: string
}

export interface ProjectResult extends ActionResult {
  projectId?: string
}

export interface Task {
  id?: string
  title: string
  description?: string
  projectId?: string
  assigneeId?: string
  dueDate?: Date
}

export interface TaskResult extends ActionResult {
  taskId?: string
}

export interface TaskDestination {
  projectId?: string
  listId?: string
  position?: number
}

export interface ProjectFilters {
  name?: string
  limit?: number
}

export interface TaskFilters {
  projectId?: string
  assigneeId?: string
  completed?: boolean
  limit?: number
}

// Database types
export interface DatabaseRecord {
  id?: string
  baseId?: string
  tableName?: string
  fields: Record<string, any>
  metadata?: Record<string, any>
}

export interface DatabaseResult extends ActionResult {
  recordId?: string
  fields?: Record<string, any>
}

export interface RecordFilters {
  baseId?: string
  tableName?: string
  filterByFormula?: string
  maxRecords?: number
  pageSize?: number
  offset?: string
  view?: string
  sort?: Array<{
    field: string
    direction: 'asc' | 'desc'
  }>
}

export interface TableFilters {
  baseId?: string
  includeDeleted?: boolean
}

export interface Table {
  id: string
  name: string
  description?: string
  fields: Array<{
    id: string
    name: string
    type: string
    options?: Record<string, any>
  }>
}

export interface SearchParams {
  baseId?: string
  tableName?: string
  searchFormula?: string
  filter?: string
  limit?: number
}

// Social types
export interface SocialPost {
  content: string
  mediaFiles?: string[]
  scheduledTime?: Date
  hashtags?: string[]
  mentions?: string[]
  metadata?: Record<string, any>
}

export interface SocialResult extends ActionResult {
  postId?: string
  url?: string
  engagement?: {
    likes?: number
    shares?: number
    comments?: number
  }
}

export interface SocialMention {
  id: string
  content: string
  author: string
  timestamp: Date
  platform: string
  url?: string
}

export interface MentionFilters {
  dateRange?: DateRange
  author?: string
  limit?: number
}

export interface InsightsParams {
  metric: string
  period: string
  periodCount: number
  startDate?: Date
  endDate?: Date
}

export interface InsightsResult extends ActionResult {
  metrics?: Array<{
    metric: string
    value: number
    period: string
    timestamp: Date
  }>
}

export interface DirectMessage {
  recipientId: string
  content: string
  mediaFiles?: string[]
  metadata?: Record<string, any>
}

// DevOps types
export interface Repository {
  id?: string
  name: string
  description?: string
  private?: boolean
  owner?: string
  defaultBranch?: string
}

export interface RepositoryResult extends ActionResult {
  repositoryId?: string
  name?: string
  url?: string
}

export interface Issue {
  id?: string
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
  milestone?: string
  repository?: string
  state?: 'open' | 'closed'
}

export interface IssueResult extends ActionResult {
  issueId?: string
  issueNumber?: number
  url?: string
}

export interface PullRequest {
  id?: string
  title: string
  body?: string
  head: string
  base?: string
  repository: string
  draft?: boolean
}

export interface PullRequestResult extends ActionResult {
  pullRequestId?: string
  pullRequestNumber?: number
  url?: string
}

export interface RepoFilters {
  owner?: string
  name?: string
  private?: boolean
  limit?: number
}

export interface IssueFilters {
  repository?: string
  state?: 'open' | 'closed' | 'all'
  labels?: string[]
  assignee?: string
  limit?: number
}

// Document types
export interface DocumentParams {
  title: string
  content?: string
  parentId?: string
  template?: string
  metadata?: Record<string, any>
}

export interface DocumentResult extends ActionResult {
  documentId?: string
  title?: string
  url?: string
  editUrl?: string
}

export interface DocumentUpdate {
  title?: string
  content?: string
  appendContent?: string
  insertContent?: {
    index: number
    text: string
  }
  replaceContent?: {
    searchText: string
    replaceText: string
  }
}

export interface DocumentInfo {
  id: string
  title: string
  content?: string
  createdAt: Date
  modifiedAt: Date
  size?: number
  url?: string
  editUrl?: string
  permissions?: string[]
}

export interface DocumentFilters {
  title?: string
  parentId?: string
  createdAfter?: Date
  modifiedAfter?: Date
  limit?: number
}

export interface ExportFormat {
  type: 'pdf' | 'docx' | 'txt' | 'html' | 'rtf' | 'odt'
  options?: Record<string, any>
}

export interface DocumentExport {
  content: Buffer
  mimeType: string
  filename: string
}

// Payment types
export interface PaymentParams {
  amount: number
  currency: string
  customerId?: string
  description?: string
  metadata?: Record<string, any>
  paymentMethodId?: string
  confirmationMethod?: 'automatic' | 'manual'
}

export interface PaymentResult extends ActionResult {
  paymentId?: string
  status?: string
  clientSecret?: string
}

export interface PaymentInfo {
  id: string
  amount: number
  currency: string
  status: string
  customerId?: string
  description?: string
  createdAt: Date
  confirmedAt?: Date
  metadata?: Record<string, any>
}

export interface PaymentFilters {
  customerId?: string
  status?: string
  currency?: string
  dateRange?: DateRange
  limit?: number
}

export interface RefundResult extends ActionResult {
  refundId?: string
  amount?: number
  status?: string
}

export interface CustomerParams {
  email?: string
  name?: string
  description?: string
  phone?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
  metadata?: Record<string, any>
}

export interface CustomerResult extends ActionResult {
  customerId?: string
  email?: string
}

export interface CustomerInfo {
  id: string
  email?: string
  name?: string
  description?: string
  phone?: string
  createdAt: Date
  metadata?: Record<string, any>
}

export interface SubscriptionParams {
  customerId: string
  priceId?: string
  items?: Array<{
    priceId: string
    quantity?: number
  }>
  trialPeriodDays?: number
  metadata?: Record<string, any>
}

export interface SubscriptionResult extends ActionResult {
  subscriptionId?: string
  status?: string
  currentPeriodEnd?: Date
}

export interface SubscriptionInfo {
  id: string
  customerId: string
  status: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  items: Array<{
    id: string
    priceId: string
    quantity: number
  }>
  metadata?: Record<string, any>
}

export interface SubscriptionFilters {
  customerId?: string
  status?: string
  priceId?: string
  limit?: number
}

export interface InvoiceParams {
  customerId: string
  description?: string
  dueDate?: Date
  metadata?: Record<string, any>
}

export interface InvoiceResult extends ActionResult {
  invoiceId?: string
  status?: string
  hostedInvoiceUrl?: string
}

export interface InvoiceInfo {
  id: string
  customerId: string
  amount: number
  currency: string
  status: string
  description?: string
  dueDate?: Date
  paidAt?: Date
  createdAt: Date
  hostedInvoiceUrl?: string
}

export interface InvoiceFilters {
  customerId?: string
  status?: string
  dateRange?: DateRange
  limit?: number
}

// E-commerce types
export interface ProductParams {
  title: string
  description?: string
  price: number
  compareAtPrice?: number
  currency?: string
  images?: string[]
  variants?: Array<{
    title: string
    price: number
    sku?: string
    inventory_quantity?: number
    weight?: number
    requires_shipping?: boolean
  }>
  tags?: string[]
  vendor?: string
  productType?: string
  published?: boolean
  metadata?: Record<string, any>
}

export interface ProductResult extends ActionResult {
  productId?: string
  title?: string
  handle?: string
}

export interface ProductInfo {
  id: string
  title: string
  description?: string
  price: number
  compareAtPrice?: number
  currency: string
  images: string[]
  variants: Array<{
    id: string
    title: string
    price: number
    sku?: string
    inventory_quantity: number
    weight?: number
  }>
  tags: string[]
  vendor?: string
  productType?: string
  published: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ProductFilters {
  title?: string
  vendor?: string
  productType?: string
  published?: boolean
  tags?: string[]
  priceRange?: {
    min: number
    max: number
  }
  limit?: number
}

export interface OrderParams {
  customerId?: string
  lineItems: Array<{
    productId?: string
    variantId?: string
    quantity: number
    price?: number
    title?: string
  }>
  shippingAddress?: {
    firstName?: string
    lastName?: string
    company?: string
    address1: string
    address2?: string
    city: string
    province?: string
    country: string
    zip: string
    phone?: string
  }
  billingAddress?: {
    firstName?: string
    lastName?: string
    company?: string
    address1: string
    address2?: string
    city: string
    province?: string
    country: string
    zip: string
    phone?: string
  }
  email?: string
  phone?: string
  note?: string
  tags?: string[]
  financialStatus?: string
  fulfillmentStatus?: string
  metadata?: Record<string, any>
}

export interface OrderResult extends ActionResult {
  orderId?: string
  orderNumber?: string
  totalPrice?: number
}

export interface OrderInfo {
  id: string
  orderNumber: string
  customerId?: string
  email?: string
  totalPrice: number
  subtotalPrice: number
  totalTax: number
  currency: string
  financialStatus: string
  fulfillmentStatus: string
  lineItems: Array<{
    id: string
    productId?: string
    variantId?: string
    title: string
    quantity: number
    price: number
    totalDiscount: number
  }>
  shippingAddress?: any
  billingAddress?: any
  createdAt: Date
  updatedAt: Date
  tags: string[]
}

export interface OrderFilters {
  customerId?: string
  email?: string
  financialStatus?: string
  fulfillmentStatus?: string
  dateRange?: DateRange
  limit?: number
}

export interface InventoryResult extends ActionResult {
  productId?: string
  inventoryQuantity?: number
}

export interface InventoryInfo {
  productId: string
  variantId?: string
  sku?: string
  inventoryQuantity: number
  inventoryPolicy: string
  inventoryManagement: string
  updatedAt: Date
}

export interface InventoryFilters {
  productId?: string
  sku?: string
  lowStock?: boolean
  limit?: number
}