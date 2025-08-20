import { EventEmitter } from 'events'
import { WorkflowDefinition } from './workflow-engine'
import { auditLogger, AuditEventType } from '../security/audit-logger'

/**
 * Template categories
 */
export enum TemplateCategory {
  AUTOMATION = 'automation',
  INTEGRATION = 'integration',
  MARKETING = 'marketing',
  SALES = 'sales',
  CUSTOMER_SERVICE = 'customer_service',
  HR = 'hr',
  FINANCE = 'finance',
  OPERATIONS = 'operations',
  DEVELOPMENT = 'development',
  ANALYTICS = 'analytics',
  COMMUNICATION = 'communication',
  PROJECT_MANAGEMENT = 'project_management',
  E_COMMERCE = 'e_commerce',
  SOCIAL_MEDIA = 'social_media',
  CONTENT = 'content',
  DATA_PROCESSING = 'data_processing',
  MONITORING = 'monitoring',
  UTILITIES = 'utilities'
}

/**
 * Template complexity levels
 */
export enum ComplexityLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

/**
 * Template pricing models
 */
export enum PricingModel {
  FREE = 'free',
  ONE_TIME = 'one_time',
  SUBSCRIPTION = 'subscription',
  USAGE_BASED = 'usage_based',
  FREEMIUM = 'freemium'
}

/**
 * Template status
 */
export enum TemplateStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
  REJECTED = 'rejected',
  ARCHIVED = 'archived'
}

/**
 * Publishing visibility
 */
export enum TemplateVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  ORGANIZATION = 'organization',
  MARKETPLACE = 'marketplace'
}

/**
 * Template variable definition
 */
export interface TemplateVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'secret'
  required: boolean
  defaultValue?: any
  description: string
  placeholder?: string
  validation?: {
    pattern?: string
    min?: number
    max?: number
    options?: string[]
  }
  sensitive?: boolean
  category?: 'input' | 'config' | 'credential'
}

/**
 * Template requirement
 */
export interface TemplateRequirement {
  type: 'integration' | 'permission' | 'plan' | 'feature'
  provider?: string
  permission?: string
  planLevel?: string
  feature?: string
  description: string
  optional: boolean
}

/**
 * Template metadata
 */
export interface TemplateMetadata {
  estimatedSetupTime: number // minutes
  estimatedExecutionTime: number // milliseconds
  memoryRequirement: number // MB
  cpuRequirement: number // cores
  networkRequirement: boolean
  supportedRegions: string[]
  supportedLanguages: string[]
  integrations: string[]
  permissions: string[]
}

/**
 * Template rating and review
 */
export interface TemplateReview {
  id: string
  templateId: string
  userId: string
  userName: string
  rating: number // 1-5
  title: string
  comment: string
  helpful: number
  notHelpful: number
  createdAt: number
  verified: boolean
  response?: {
    from: string
    message: string
    timestamp: number
  }
}

/**
 * Template usage statistics
 */
export interface TemplateUsageStats {
  totalInstalls: number
  activeInstalls: number
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  averageRating: number
  totalReviews: number
  installsByRegion: Record<string, number>
  installsByPlan: Record<string, number>
  usageByWeek: Array<{
    week: string
    installs: number
    executions: number
  }>
}

/**
 * Workflow template
 */
export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  longDescription: string
  category: TemplateCategory
  subcategory?: string
  tags: string[]
  complexity: ComplexityLevel
  status: TemplateStatus
  visibility: TemplateVisibility
  
  // Author information
  author: {
    id: string
    name: string
    email: string
    organizationId?: string
    verified: boolean
    bio?: string
    website?: string
  }
  
  // Template definition
  workflowDefinition: WorkflowDefinition
  variables: TemplateVariable[]
  requirements: TemplateRequirement[]
  metadata: TemplateMetadata
  
  // Media and documentation
  thumbnailUrl?: string
  screenshots: string[]
  videoUrl?: string
  documentation: {
    setup: string
    usage: string
    troubleshooting: string
    changelog: string
    faq: Array<{
      question: string
      answer: string
    }>
  }
  
  // Pricing and licensing
  pricing: {
    model: PricingModel
    price?: number
    currency?: string
    billingInterval?: 'monthly' | 'yearly'
    freeTrialDays?: number
    usageLimit?: number
  }
  license: string
  
  // Marketplace data
  featured: boolean
  promoted: boolean
  editorChoice: boolean
  trending: boolean
  
  // Statistics and reviews
  stats: TemplateUsageStats
  reviews: TemplateReview[]
  
  // Versioning
  version: string
  previousVersions: string[]
  minimumEngineVersion: string
  
  // Timestamps
  createdAt: number
  updatedAt: number
  publishedAt?: number
  featuredAt?: number
  
  // Moderation
  reviewedBy?: string
  reviewedAt?: number
  rejectionReason?: string
}

/**
 * Template installation
 */
export interface TemplateInstallation {
  id: string
  templateId: string
  userId: string
  workflowId: string
  installedAt: number
  customizations: Record<string, any>
  variableValues: Record<string, any>
  status: 'active' | 'inactive' | 'failed'
  lastUsed?: number
  totalExecutions: number
  successfulExecutions: number
}

/**
 * Template collection
 */
export interface TemplateCollection {
  id: string
  name: string
  description: string
  creatorId: string
  creatorName: string
  templates: string[]
  tags: string[]
  featured: boolean
  public: boolean
  createdAt: number
  updatedAt: number
}

/**
 * Search filters
 */
export interface TemplateSearchFilters {
  categories?: TemplateCategory[]
  complexity?: ComplexityLevel[]
  pricing?: PricingModel[]
  integrations?: string[]
  tags?: string[]
  rating?: number
  featured?: boolean
  trending?: boolean
  author?: string
  organization?: string
}

/**
 * Template marketplace and management system
 */
export class WorkflowMarketplace extends EventEmitter {
  private templates = new Map<string, WorkflowTemplate>()
  private installations = new Map<string, TemplateInstallation[]>()
  private collections = new Map<string, TemplateCollection>()
  private featuredTemplates: string[] = []
  private trendingTemplates: string[] = []
  private moderationQueue: string[] = []

  constructor() {
    super()
    this.initializeDefaultTemplates()
    this.startTrendingCalculation()
    console.log('🏪 Workflow marketplace initialized')
  }

  /**
   * Create new template
   */
  async createTemplate(
    template: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt' | 'stats' | 'reviews'>,
    authorId: string
  ): Promise<string> {
    const templateId = this.generateTemplateId()
    
    const fullTemplate: WorkflowTemplate = {
      ...template,
      id: templateId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stats: {
        totalInstalls: 0,
        activeInstalls: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageRating: 0,
        totalReviews: 0,
        installsByRegion: {},
        installsByPlan: {},
        usageByWeek: []
      },
      reviews: []
    }
    
    // Validate template
    this.validateTemplate(fullTemplate)
    
    this.templates.set(templateId, fullTemplate)
    
    // Add to moderation queue if public
    if (fullTemplate.visibility === TemplateVisibility.PUBLIC ||
        fullTemplate.visibility === TemplateVisibility.MARKETPLACE) {
      this.moderationQueue.push(templateId)
      fullTemplate.status = TemplateStatus.PENDING_REVIEW
    }
    
    await auditLogger.logEvent({
      type: AuditEventType.DATA_CREATED,
      severity: 'info',
      action: 'template_created',
      outcome: 'success',
      description: `Workflow template created: ${fullTemplate.name}`,
      userId: authorId,
      resource: templateId,
      metadata: {
        category: fullTemplate.category,
        complexity: fullTemplate.complexity,
        visibility: fullTemplate.visibility
      }
    })
    
    this.emit('templateCreated', fullTemplate)
    console.log(`📄 Template created: ${fullTemplate.name}`)
    
    return templateId
  }

  /**
   * Publish template to marketplace
   */
  async publishTemplate(
    templateId: string,
    publisherId: string,
    approvalComment?: string
  ): Promise<boolean> {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }
    
    if (template.status !== TemplateStatus.APPROVED) {
      throw new Error(`Template must be approved before publishing: ${template.status}`)
    }
    
    template.status = TemplateStatus.PUBLISHED
    template.publishedAt = Date.now()
    template.updatedAt = Date.now()
    
    await auditLogger.logEvent({
      type: AuditEventType.DATA_UPDATED,
      severity: 'info',
      action: 'template_published',
      outcome: 'success',
      description: `Template published to marketplace: ${template.name}`,
      userId: publisherId,
      resource: templateId,
      metadata: {
        approvalComment,
        publishedAt: template.publishedAt
      }
    })
    
    this.emit('templatePublished', template)
    console.log(`🚀 Template published: ${template.name}`)
    
    return true
  }

  /**
   * Install template for user
   */
  async installTemplate(
    templateId: string,
    userId: string,
    customizations: {
      workflowName?: string
      variableValues: Record<string, any>
      customizations?: Record<string, any>
    }
  ): Promise<string> {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }
    
    if (template.status !== TemplateStatus.PUBLISHED) {
      throw new Error(`Template is not published: ${template.status}`)
    }
    
    // Validate requirements
    await this.validateRequirements(template, userId)
    
    // Create workflow from template
    const workflowDefinition = this.instantiateTemplate(template, customizations.variableValues)
    if (customizations.workflowName) {
      workflowDefinition.name = customizations.workflowName
    }
    
    // Generate unique workflow ID
    const workflowId = this.generateWorkflowId()
    workflowDefinition.id = workflowId
    
    // Create installation record
    const installation: TemplateInstallation = {
      id: this.generateInstallationId(),
      templateId,
      userId,
      workflowId,
      installedAt: Date.now(),
      customizations: customizations.customizations || {},
      variableValues: customizations.variableValues,
      status: 'active',
      totalExecutions: 0,
      successfulExecutions: 0
    }
    
    // Store installation
    if (!this.installations.has(userId)) {
      this.installations.set(userId, [])
    }
    this.installations.get(userId)!.push(installation)
    
    // Update template statistics
    template.stats.totalInstalls++
    template.stats.activeInstalls++
    template.updatedAt = Date.now()
    
    await auditLogger.logEvent({
      type: AuditEventType.DATA_CREATED,
      severity: 'info',
      action: 'template_installed',
      outcome: 'success',
      description: `Template installed: ${template.name}`,
      userId,
      resource: templateId,
      metadata: {
        workflowId,
        installationId: installation.id
      }
    })
    
    this.emit('templateInstalled', template, installation, workflowDefinition)
    console.log(`⬇️ Template installed: ${template.name} for user ${userId}`)
    
    return workflowId
  }

  /**
   * Search templates
   */
  searchTemplates(
    query: string,
    filters: TemplateSearchFilters = {},
    options: {
      page?: number
      pageSize?: number
      sortBy?: 'relevance' | 'popularity' | 'rating' | 'newest' | 'name'
      sortOrder?: 'asc' | 'desc'
    } = {}
  ): {
    templates: WorkflowTemplate[]
    totalCount: number
    page: number
    pageSize: number
  } {
    let results = Array.from(this.templates.values())
      .filter(template => template.status === TemplateStatus.PUBLISHED)
    
    // Apply text search
    if (query) {
      const searchQuery = query.toLowerCase()
      results = results.filter(template =>
        template.name.toLowerCase().includes(searchQuery) ||
        template.description.toLowerCase().includes(searchQuery) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchQuery))
      )
    }
    
    // Apply filters
    if (filters.categories && filters.categories.length > 0) {
      results = results.filter(template => filters.categories!.includes(template.category))
    }
    
    if (filters.complexity && filters.complexity.length > 0) {
      results = results.filter(template => filters.complexity!.includes(template.complexity))
    }
    
    if (filters.pricing && filters.pricing.length > 0) {
      results = results.filter(template => filters.pricing!.includes(template.pricing.model))
    }
    
    if (filters.integrations && filters.integrations.length > 0) {
      results = results.filter(template =>
        filters.integrations!.some(integration =>
          template.metadata.integrations.includes(integration)
        )
      )
    }
    
    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(template =>
        filters.tags!.some(tag => template.tags.includes(tag))
      )
    }
    
    if (filters.rating) {
      results = results.filter(template => template.stats.averageRating >= filters.rating!)
    }
    
    if (filters.featured) {
      results = results.filter(template => template.featured)
    }
    
    if (filters.trending) {
      results = results.filter(template => template.trending)
    }
    
    if (filters.author) {
      results = results.filter(template => template.author.id === filters.author)
    }
    
    // Apply sorting
    const sortBy = options.sortBy || 'relevance'
    const sortOrder = options.sortOrder || 'desc'
    
    results.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'popularity':
          comparison = a.stats.totalInstalls - b.stats.totalInstalls
          break
        case 'rating':
          comparison = a.stats.averageRating - b.stats.averageRating
          break
        case 'newest':
          comparison = a.createdAt - b.createdAt
          break
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'relevance':
        default:
          // Simple relevance scoring
          const aRelevance = this.calculateRelevanceScore(a, query, filters)
          const bRelevance = this.calculateRelevanceScore(b, query, filters)
          comparison = aRelevance - bRelevance
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })
    
    // Apply pagination
    const page = options.page || 1
    const pageSize = options.pageSize || 20
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    
    return {
      templates: results.slice(startIndex, endIndex),
      totalCount: results.length,
      page,
      pageSize
    }
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): WorkflowTemplate | undefined {
    return this.templates.get(templateId)
  }

  /**
   * Get featured templates
   */
  getFeaturedTemplates(limit = 10): WorkflowTemplate[] {
    return this.featuredTemplates
      .map(id => this.templates.get(id))
      .filter(Boolean)
      .slice(0, limit) as WorkflowTemplate[]
  }

  /**
   * Get trending templates
   */
  getTrendingTemplates(limit = 10): WorkflowTemplate[] {
    return this.trendingTemplates
      .map(id => this.templates.get(id))
      .filter(Boolean)
      .slice(0, limit) as WorkflowTemplate[]
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(
    category: TemplateCategory,
    limit = 20
  ): WorkflowTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => 
        template.category === category && 
        template.status === TemplateStatus.PUBLISHED
      )
      .sort((a, b) => b.stats.totalInstalls - a.stats.totalInstalls)
      .slice(0, limit)
  }

  /**
   * Get user's installed templates
   */
  getUserInstallations(userId: string): TemplateInstallation[] {
    return this.installations.get(userId) || []
  }

  /**
   * Add template review
   */
  async addReview(
    templateId: string,
    userId: string,
    review: {
      rating: number
      title: string
      comment: string
      userName: string
    }
  ): Promise<string> {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }
    
    // Check if user has installed the template
    const userInstallations = this.getUserInstallations(userId)
    const hasInstalled = userInstallations.some(installation => 
      installation.templateId === templateId
    )
    
    const reviewId = this.generateReviewId()
    const templateReview: TemplateReview = {
      id: reviewId,
      templateId,
      userId,
      userName: review.userName,
      rating: Math.max(1, Math.min(5, review.rating)), // Clamp to 1-5
      title: review.title,
      comment: review.comment,
      helpful: 0,
      notHelpful: 0,
      createdAt: Date.now(),
      verified: hasInstalled
    }
    
    template.reviews.push(templateReview)
    template.stats.totalReviews++
    
    // Recalculate average rating
    const totalRating = template.reviews.reduce((sum, r) => sum + r.rating, 0)
    template.stats.averageRating = totalRating / template.reviews.length
    
    template.updatedAt = Date.now()
    
    await auditLogger.logEvent({
      type: AuditEventType.DATA_CREATED,
      severity: 'info',
      action: 'template_reviewed',
      outcome: 'success',
      description: `Template reviewed: ${template.name}`,
      userId,
      resource: templateId,
      metadata: {
        reviewId,
        rating: review.rating,
        verified: hasInstalled
      }
    })
    
    this.emit('templateReviewed', template, templateReview)
    console.log(`⭐ Template reviewed: ${template.name} (${review.rating}/5)`)
    
    return reviewId
  }

  /**
   * Create template collection
   */
  async createCollection(
    collection: Omit<TemplateCollection, 'id' | 'createdAt' | 'updatedAt'>,
    creatorId: string
  ): Promise<string> {
    const collectionId = this.generateCollectionId()
    
    const fullCollection: TemplateCollection = {
      ...collection,
      id: collectionId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    this.collections.set(collectionId, fullCollection)
    
    this.emit('collectionCreated', fullCollection)
    console.log(`📚 Collection created: ${fullCollection.name}`)
    
    return collectionId
  }

  /**
   * Get marketplace statistics
   */
  getMarketplaceStats(): {
    totalTemplates: number
    publishedTemplates: number
    totalInstalls: number
    totalExecutions: number
    averageRating: number
    topCategories: Array<{
      category: TemplateCategory
      count: number
      installs: number
    }>
    topAuthors: Array<{
      authorId: string
      authorName: string
      templateCount: number
      totalInstalls: number
    }>
    recentActivity: Array<{
      type: 'template_created' | 'template_installed' | 'template_reviewed'
      templateId: string
      templateName: string
      timestamp: number
      details?: any
    }>
  } {
    const templates = Array.from(this.templates.values())
    const publishedTemplates = templates.filter(t => t.status === TemplateStatus.PUBLISHED)
    
    const totalTemplates = templates.length
    const totalInstalls = publishedTemplates.reduce((sum, t) => sum + t.stats.totalInstalls, 0)
    const totalExecutions = publishedTemplates.reduce((sum, t) => sum + t.stats.totalExecutions, 0)
    
    const totalRatings = publishedTemplates.reduce((sum, t) => sum + t.stats.totalReviews, 0)
    const totalRatingSum = publishedTemplates.reduce((sum, t) => 
      sum + (t.stats.averageRating * t.stats.totalReviews), 0
    )
    const averageRating = totalRatings > 0 ? totalRatingSum / totalRatings : 0
    
    // Top categories
    const categoryStats = new Map<TemplateCategory, { count: number; installs: number }>()
    for (const template of publishedTemplates) {
      if (!categoryStats.has(template.category)) {
        categoryStats.set(template.category, { count: 0, installs: 0 })
      }
      const stats = categoryStats.get(template.category)!
      stats.count++
      stats.installs += template.stats.totalInstalls
    }
    
    const topCategories = Array.from(categoryStats.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => b.installs - a.installs)
      .slice(0, 10)
    
    // Top authors
    const authorStats = new Map<string, { 
      authorName: string
      templateCount: number
      totalInstalls: number 
    }>()
    
    for (const template of publishedTemplates) {
      if (!authorStats.has(template.author.id)) {
        authorStats.set(template.author.id, {
          authorName: template.author.name,
          templateCount: 0,
          totalInstalls: 0
        })
      }
      const stats = authorStats.get(template.author.id)!
      stats.templateCount++
      stats.totalInstalls += template.stats.totalInstalls
    }
    
    const topAuthors = Array.from(authorStats.entries())
      .map(([authorId, stats]) => ({ authorId, ...stats }))
      .sort((a, b) => b.totalInstalls - a.totalInstalls)
      .slice(0, 10)
    
    // Recent activity (mock implementation)
    const recentActivity: any[] = []
    
    return {
      totalTemplates,
      publishedTemplates: publishedTemplates.length,
      totalInstalls,
      totalExecutions,
      averageRating,
      topCategories,
      topAuthors,
      recentActivity
    }
  }

  /**
   * Moderate template (approve/reject)
   */
  async moderateTemplate(
    templateId: string,
    moderatorId: string,
    decision: 'approve' | 'reject',
    comment: string
  ): Promise<boolean> {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }
    
    if (template.status !== TemplateStatus.PENDING_REVIEW) {
      throw new Error(`Template is not pending review: ${template.status}`)
    }
    
    template.reviewedBy = moderatorId
    template.reviewedAt = Date.now()
    template.updatedAt = Date.now()
    
    if (decision === 'approve') {
      template.status = TemplateStatus.APPROVED
    } else {
      template.status = TemplateStatus.REJECTED
      template.rejectionReason = comment
    }
    
    // Remove from moderation queue
    const queueIndex = this.moderationQueue.indexOf(templateId)
    if (queueIndex > -1) {
      this.moderationQueue.splice(queueIndex, 1)
    }
    
    await auditLogger.logEvent({
      type: AuditEventType.DATA_UPDATED,
      severity: 'info',
      action: `template_${decision}d`,
      outcome: 'success',
      description: `Template ${decision}d: ${template.name}`,
      userId: moderatorId,
      resource: templateId,
      metadata: {
        decision,
        comment,
        reviewedAt: template.reviewedAt
      }
    })
    
    this.emit('templateModerated', template, decision, comment)
    console.log(`✅ Template ${decision}d: ${template.name}`)
    
    return true
  }

  /**
   * Validate template definition
   */
  private validateTemplate(template: WorkflowTemplate): void {
    if (!template.name || !template.description) {
      throw new Error('Template must have name and description')
    }
    
    if (!template.workflowDefinition) {
      throw new Error('Template must have workflow definition')
    }
    
    if (!template.author.id || !template.author.name) {
      throw new Error('Template must have author information')
    }
    
    // Validate variables
    for (const variable of template.variables) {
      if (!variable.name || !variable.type) {
        throw new Error('Template variables must have name and type')
      }
    }
    
    // Validate requirements
    for (const requirement of template.requirements) {
      if (!requirement.type || !requirement.description) {
        throw new Error('Template requirements must have type and description')
      }
    }
  }

  /**
   * Validate user meets requirements
   */
  private async validateRequirements(
    template: WorkflowTemplate,
    userId: string
  ): Promise<void> {
    for (const requirement of template.requirements) {
      if (!requirement.optional) {
        // In production, check actual user permissions/integrations
        // This is a placeholder implementation
        switch (requirement.type) {
          case 'integration':
            // Check if user has integration connected
            break
          case 'permission':
            // Check if user has required permission
            break
          case 'plan':
            // Check if user has required plan level
            break
          case 'feature':
            // Check if user has access to feature
            break
        }
      }
    }
  }

  /**
   * Instantiate template with variable values
   */
  private instantiateTemplate(
    template: WorkflowTemplate,
    variableValues: Record<string, any>
  ): WorkflowDefinition {
    // Deep clone the workflow definition
    const definition = JSON.parse(JSON.stringify(template.workflowDefinition))
    
    // Replace template variables in the definition
    this.replaceVariables(definition, variableValues)
    
    return definition
  }

  /**
   * Replace template variables in object
   */
  private replaceVariables(obj: any, variables: Record<string, any>): void {
    if (typeof obj === 'string') {
      // Replace {{variable}} syntax
      for (const [key, value] of Object.entries(variables)) {
        obj = obj.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
      }
      return obj
    }
    
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = this.replaceVariables(obj[i], variables)
      }
      return obj
    }
    
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        obj[key] = this.replaceVariables(value, variables)
      }
    }
    
    return obj
  }

  /**
   * Calculate relevance score for search
   */
  private calculateRelevanceScore(
    template: WorkflowTemplate,
    query: string,
    filters: TemplateSearchFilters
  ): number {
    let score = 0
    
    if (query) {
      const searchQuery = query.toLowerCase()
      
      // Name match (highest weight)
      if (template.name.toLowerCase().includes(searchQuery)) {
        score += 100
      }
      
      // Description match
      if (template.description.toLowerCase().includes(searchQuery)) {
        score += 50
      }
      
      // Tag match
      for (const tag of template.tags) {
        if (tag.toLowerCase().includes(searchQuery)) {
          score += 25
        }
      }
      
      // Category match
      if (template.category.toLowerCase().includes(searchQuery)) {
        score += 30
      }
    }
    
    // Popularity boost
    score += template.stats.totalInstalls * 0.1
    
    // Rating boost
    score += template.stats.averageRating * 10
    
    // Featured boost
    if (template.featured) score += 50
    if (template.trending) score += 30
    if (template.editorChoice) score += 40
    
    return score
  }

  /**
   * Initialize default templates
   */
  private async initializeDefaultTemplates(): Promise<void> {
    // This would load default/starter templates
    // For now, we'll create a few example templates
    
    const exampleTemplate: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt' | 'stats' | 'reviews'> = {
      name: 'Email to Slack Notification',
      description: 'Automatically send Slack notifications when important emails arrive',
      longDescription: 'This workflow monitors your Gmail inbox for emails matching specific criteria and sends formatted notifications to a Slack channel.',
      category: TemplateCategory.AUTOMATION,
      tags: ['email', 'slack', 'notifications', 'automation'],
      complexity: ComplexityLevel.BEGINNER,
      status: TemplateStatus.PUBLISHED,
      visibility: TemplateVisibility.MARKETPLACE,
      author: {
        id: 'system',
        name: 'ChainReact Team',
        email: 'team@chainreact.com',
        verified: true,
        bio: 'Official ChainReact templates'
      },
      workflowDefinition: {
        id: 'email-to-slack',
        name: 'Email to Slack Notification',
        description: 'Gmail to Slack automation',
        version: 1,
        userId: 'system',
        status: TemplateStatus.PUBLISHED as any,
        nodes: [],
        edges: [],
        variables: [],
        settings: {
          concurrentExecutions: 1,
          executionTimeout: 30000,
          retryPolicy: {
            enabled: true,
            maxRetries: 3,
            backoffStrategy: 'exponential',
            baseDelay: 1000,
            maxDelay: 10000,
            retryableErrors: []
          },
          errorHandling: {
            strategy: 'fail_fast',
            fallbackActions: [],
            errorNotifications: true,
            captureStackTrace: true,
            sensitiveDataMasking: true
          },
          logging: {
            level: 'info',
            includeInput: true,
            includeOutput: true,
            includeTimings: true,
            includeHeaders: false,
            retention: 30,
            redactFields: []
          },
          notifications: {
            onSuccess: false,
            onFailure: true,
            onTimeout: true,
            channels: []
          },
          performance: {
            enableMetrics: true,
            enableTracing: true,
            samplingRate: 1.0,
            metricsRetention: 90,
            alertThresholds: {
              executionTime: 30000,
              errorRate: 0.1,
              memoryUsage: 512
            }
          }
        },
        triggers: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
        category: 'automation'
      },
      variables: [
        {
          name: 'slackChannel',
          type: 'string',
          required: true,
          description: 'Slack channel to send notifications to',
          placeholder: '#general'
        },
        {
          name: 'emailSender',
          type: 'string',
          required: false,
          description: 'Filter emails from specific sender',
          placeholder: 'boss@company.com'
        }
      ],
      requirements: [
        {
          type: 'integration',
          provider: 'gmail',
          description: 'Gmail integration required',
          optional: false
        },
        {
          type: 'integration',
          provider: 'slack',
          description: 'Slack integration required',
          optional: false
        }
      ],
      metadata: {
        estimatedSetupTime: 5,
        estimatedExecutionTime: 2000,
        memoryRequirement: 128,
        cpuRequirement: 0.1,
        networkRequirement: true,
        supportedRegions: ['us-east-1', 'eu-west-1'],
        supportedLanguages: ['en'],
        integrations: ['gmail', 'slack'],
        permissions: ['read:email', 'write:chat']
      },
      thumbnailUrl: '/templates/thumbnails/email-to-slack.png',
      screenshots: ['/templates/screenshots/email-to-slack-1.png'],
      documentation: {
        setup: 'Connect your Gmail and Slack integrations, then configure the channel and filters.',
        usage: 'The workflow will automatically monitor your emails and send notifications.',
        troubleshooting: 'Ensure both integrations are properly connected and authorized.',
        changelog: '1.0.0 - Initial release',
        faq: [
          {
            question: 'How often does it check for emails?',
            answer: 'The workflow checks for new emails every 5 minutes.'
          }
        ]
      },
      pricing: {
        model: PricingModel.FREE
      },
      license: 'MIT',
      featured: true,
      promoted: false,
      editorChoice: true,
      trending: false,
      version: '1.0.0',
      previousVersions: [],
      minimumEngineVersion: '1.0.0'
    }
    
    await this.createTemplate(exampleTemplate, 'system')
  }

  /**
   * Start trending calculation
   */
  private startTrendingCalculation(): void {
    // Recalculate trending templates every hour
    setInterval(() => {
      this.calculateTrendingTemplates()
    }, 60 * 60 * 1000)
    
    // Initial calculation
    this.calculateTrendingTemplates()
  }

  /**
   * Calculate trending templates
   */
  private calculateTrendingTemplates(): void {
    const now = Date.now()
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000)
    
    const templates = Array.from(this.templates.values())
      .filter(t => t.status === TemplateStatus.PUBLISHED)
    
    // Calculate trending score based on recent activity
    const trendingScores = templates.map(template => {
      let score = 0
      
      // Recent installs (last 7 days)
      const recentInstalls = template.stats.usageByWeek
        .filter(week => Date.parse(week.week) >= weekAgo)
        .reduce((sum, week) => sum + week.installs, 0)
      
      score += recentInstalls * 10
      
      // Recent reviews
      const recentReviews = template.reviews
        .filter(review => review.createdAt >= weekAgo)
      
      score += recentReviews.length * 5
      
      // Overall rating boost
      score += template.stats.averageRating * 2
      
      return { templateId: template.id, score }
    })
    
    // Sort by trending score and take top 20
    this.trendingTemplates = trendingScores
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(item => item.templateId)
    
    // Update trending flag on templates
    for (const template of templates) {
      template.trending = this.trendingTemplates.includes(template.id)
    }
    
    console.log(`📈 Updated trending templates: ${this.trendingTemplates.length}`)
  }

  /**
   * Generate template ID
   */
  private generateTemplateId(): string {
    return `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate workflow ID
   */
  private generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate installation ID
   */
  private generateInstallationId(): string {
    return `install_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate review ID
   */
  private generateReviewId(): string {
    return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate collection ID
   */
  private generateCollectionId(): string {
    return `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Shutdown marketplace
   */
  shutdown(): void {
    this.templates.clear()
    this.installations.clear()
    this.collections.clear()
    this.featuredTemplates.length = 0
    this.trendingTemplates.length = 0
    this.moderationQueue.length = 0
    
    this.removeAllListeners()
    console.log('🛑 Workflow marketplace shutdown')
  }
}

/**
 * Global workflow marketplace instance
 */
export const workflowMarketplace = new WorkflowMarketplace()