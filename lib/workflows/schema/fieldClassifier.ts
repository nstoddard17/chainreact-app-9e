/**
 * Advanced Field Classification System
 * 
 * Dynamically analyzes field schemas to classify field types and determine
 * generation strategies without relying on hardcoded templates.
 */

export interface FieldClassification {
  type: FieldType;
  priority: FieldPriority;
  constraints: FieldConstraints;
  contextRequirements: ContextRequirement[];
  generationStrategy: GenerationStrategy;
}

export enum FieldType {
  // Content fields
  SUBJECT = 'subject',
  TITLE = 'title', 
  BODY = 'body',
  MESSAGE = 'message',
  DESCRIPTION = 'description',
  SUMMARY = 'summary',
  CONTENT = 'content',
  
  // Contact fields
  EMAIL = 'email',
  PHONE = 'phone',
  NAME = 'name',
  USERNAME = 'username',
  
  // Temporal fields
  DATE = 'date',
  TIME = 'time',
  DATETIME = 'datetime',
  DURATION = 'duration',
  
  // Categorization fields
  TAGS = 'tags',
  LABELS = 'labels',
  CATEGORY = 'category',
  STATUS = 'status',
  PRIORITY = 'priority',
  
  // Technical fields
  URL = 'url',
  FILE_PATH = 'file_path',
  JSON_DATA = 'json_data',
  
  // Platform-specific
  CHANNEL = 'channel',
  THREAD = 'thread',
  MENTION = 'mention',
  HASHTAG = 'hashtag',
  
  // Numeric fields
  AMOUNT = 'amount',
  QUANTITY = 'quantity',
  PERCENTAGE = 'percentage',
  
  // Boolean/selection
  BOOLEAN = 'boolean',
  SELECTION = 'selection',
  MULTI_SELECTION = 'multi_selection',
  
  // Fallback
  GENERIC = 'generic'
}

export enum FieldPriority {
  CRITICAL = 'critical', // Required fields that must be populated
  HIGH = 'high', // Important fields that should be populated
  MEDIUM = 'medium', // Optional fields populated if context available
  LOW = 'low', // Nice-to-have fields
  SKIP = 'skip' // Fields to ignore (system fields, etc.)
}

export interface FieldConstraints {
  required: boolean;
  nullable: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  options?: string[];
  multipleValues?: boolean;
  platformLimits?: PlatformLimits;
}

export interface PlatformLimits {
  twitter?: { maxLength: 280; requiresHashtags?: boolean };
  slack?: { maxLength: 4000; supportsMarkdown?: boolean };
  discord?: { maxLength: 2000; supportsEmbeds?: boolean };
  email?: { subjectMaxLength: 78; supportsHtml?: boolean };
  github?: { titleMaxLength: 256; supportsMarkdown?: boolean };
}

export interface ContextRequirement {
  type: 'trigger_data' | 'previous_results' | 'user_input' | 'external_api';
  field?: string;
  fallback?: string;
  required: boolean;
}

export interface GenerationStrategy {
  promptTemplate: string;
  examples?: Array<{ input: any; output: string }>;
  tone: 'formal' | 'casual' | 'technical' | 'marketing' | 'friendly';
  length: 'short' | 'medium' | 'long';
  includeContext: boolean;
  requiresValidation: boolean;
}

/**
 * Advanced Field Classifier
 */
export class FieldClassifier {
  private static readonly FIELD_NAME_PATTERNS: Record<FieldType, string[]> = {
    [FieldType.SUBJECT]: ['subject', 'headline', 'title_subject'],
    [FieldType.TITLE]: ['title', 'name', 'heading', 'header'],
    [FieldType.BODY]: ['body', 'content', 'text', 'message_body', 'html'],
    [FieldType.MESSAGE]: ['message', 'msg', 'text_message', 'content_message'],
    [FieldType.DESCRIPTION]: ['description', 'desc', 'details', 'summary_description'],
    [FieldType.SUMMARY]: ['summary', 'abstract', 'overview', 'synopsis'],
    [FieldType.CONTENT]: ['content', 'data', 'payload', 'info'],
    
    [FieldType.EMAIL]: ['email', 'email_address', 'to', 'from', 'cc', 'bcc', 'recipient', 'sender'],
    [FieldType.PHONE]: ['phone', 'telephone', 'mobile', 'cell'],
    [FieldType.NAME]: ['name', 'first_name', 'last_name', 'full_name', 'display_name'],
    [FieldType.USERNAME]: ['username', 'user_name', 'handle', 'login'],
    
    [FieldType.DATE]: ['date', 'created_at', 'updated_at', 'start_date', 'end_date', 'due_date'],
    [FieldType.TIME]: ['time', 'start_time', 'end_time'],
    [FieldType.DATETIME]: ['datetime', 'timestamp', 'scheduled_at'],
    [FieldType.DURATION]: ['duration', 'length', 'timeout'],
    
    [FieldType.TAGS]: ['tags', 'tag_list', 'keywords'],
    [FieldType.LABELS]: ['labels', 'label_ids', 'categories'],
    [FieldType.CATEGORY]: ['category', 'type', 'kind', 'class'],
    [FieldType.STATUS]: ['status', 'state', 'stage'],
    [FieldType.PRIORITY]: ['priority', 'importance', 'urgency'],
    
    [FieldType.URL]: ['url', 'link', 'href', 'website', 'avatar_url'],
    [FieldType.FILE_PATH]: ['file', 'path', 'filename', 'attachment'],
    [FieldType.JSON_DATA]: ['data', 'payload', 'metadata', 'config'],
    
    [FieldType.CHANNEL]: ['channel', 'channel_id', 'room', 'space'],
    [FieldType.THREAD]: ['thread', 'thread_id', 'conversation'],
    [FieldType.MENTION]: ['mention', 'assignee', 'user_id'],
    [FieldType.HASHTAG]: ['hashtag', 'hash_tags'],
    
    [FieldType.AMOUNT]: ['amount', 'price', 'cost', 'fee', 'value'],
    [FieldType.QUANTITY]: ['quantity', 'count', 'number', 'qty'],
    [FieldType.PERCENTAGE]: ['percentage', 'percent', 'rate'],
    
    [FieldType.BOOLEAN]: ['enabled', 'active', 'visible', 'published'],
    [FieldType.SELECTION]: ['selection', 'choice', 'option'],
    [FieldType.MULTI_SELECTION]: ['multi_select', 'multiple', 'list'],
    
    [FieldType.GENERIC]: []
  };

  private static readonly TYPE_PATTERNS: Record<FieldType, string[]> = {
    [FieldType.EMAIL]: ['email', 'email-autocomplete'],
    [FieldType.DATE]: ['date', 'datetime-local'],
    [FieldType.TIME]: ['time'],
    [FieldType.BOOLEAN]: ['boolean', 'checkbox'],
    [FieldType.SELECTION]: ['select', 'radio'],
    [FieldType.MULTI_SELECTION]: ['multiselect', 'checkbox-group'],
    [FieldType.BODY]: ['textarea', 'email-rich-text', 'discord-rich-text'],
    [FieldType.URL]: ['url'],
    [FieldType.FILE_PATH]: ['file'],
    [FieldType.GENERIC]: ['text', 'string']
  };

  /**
   * Classify a field based on its schema
   */
  static classifyField(field: any, actionType: string, providerId: string): FieldClassification {
    const fieldType = this.determineFieldType(field);
    const priority = this.determinePriority(field, fieldType);
    const constraints = this.extractConstraints(field, actionType, providerId);
    const contextRequirements = this.determineContextRequirements(fieldType, field);
    const generationStrategy = this.determineGenerationStrategy(fieldType, actionType, providerId);

    return {
      type: fieldType,
      priority,
      constraints,
      contextRequirements,
      generationStrategy
    };
  }

  /**
   * Determine field type through multi-factor analysis
   */
  private static determineFieldType(field: any): FieldType {
    const fieldName = (field.name || '').toLowerCase();
    const fieldLabel = (field.label || '').toLowerCase();
    const fieldType = (field.type || '').toLowerCase();
    const fieldDescription = (field.description || '').toLowerCase();
    
    const combined = `${fieldName} ${fieldLabel} ${fieldDescription}`;

    // Check type-based patterns first
    for (const [type, patterns] of Object.entries(this.TYPE_PATTERNS)) {
      if (patterns.includes(fieldType)) {
        return type as FieldType;
      }
    }

    // Then check name-based patterns
    for (const [type, patterns] of Object.entries(this.FIELD_NAME_PATTERNS)) {
      for (const pattern of patterns) {
        if (combined.includes(pattern)) {
          return type as FieldType;
        }
      }
    }

    // Special case handling
    if (fieldType === 'textarea' && (combined.includes('body') || combined.includes('message'))) {
      return FieldType.BODY;
    }
    
    if (fieldType === 'text' && (combined.includes('subject') || combined.includes('title'))) {
      return fieldName.includes('subject') ? FieldType.SUBJECT : FieldType.TITLE;
    }

    return FieldType.GENERIC;
  }

  /**
   * Determine field priority based on schema analysis
   */
  private static determinePriority(field: any, fieldType: FieldType): FieldPriority {
    // Skip system/readonly fields
    if (field.readonly || field.disabled || field.type === 'info' || field.type === 'divider') {
      return FieldPriority.SKIP;
    }

    // Critical: Required fields
    if (field.required === true || field.nullable === false) {
      return FieldPriority.CRITICAL;
    }

    // High: Important content fields
    if ([FieldType.SUBJECT, FieldType.TITLE, FieldType.BODY, FieldType.MESSAGE].includes(fieldType)) {
      return FieldPriority.HIGH;
    }

    // Medium: Contact and categorization fields
    if ([FieldType.EMAIL, FieldType.NAME, FieldType.TAGS, FieldType.CATEGORY].includes(fieldType)) {
      return FieldPriority.MEDIUM;
    }

    // Low: Optional metadata fields
    if ([FieldType.DESCRIPTION, FieldType.URL, FieldType.DATE].includes(fieldType)) {
      return FieldPriority.LOW;
    }

    return FieldPriority.MEDIUM;
  }

  /**
   * Extract field constraints from schema
   */
  private static extractConstraints(field: any, actionType: string, providerId: string): FieldConstraints {
    const constraints: FieldConstraints = {
      required: field.required === true,
      nullable: field.nullable !== false,
      minLength: field.minLength,
      maxLength: field.maxLength,
      pattern: field.pattern,
      format: field.format,
      options: field.options,
      multipleValues: field.multiple === true,
      platformLimits: this.getPlatformLimits(providerId, actionType)
    };

    // Apply type-specific constraints
    if (field.type === 'email') {
      constraints.pattern = constraints.pattern || '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
    }

    return constraints;
  }

  /**
   * Get platform-specific limits
   */
  private static getPlatformLimits(providerId: string, actionType: string): PlatformLimits {
    const limits: PlatformLimits = {};

    switch (providerId) {
      case 'twitter':
        limits.twitter = { maxLength: 280, requiresHashtags: true };
        break;
      case 'slack':
        limits.slack = { maxLength: 4000, supportsMarkdown: true };
        break;
      case 'discord':
        limits.discord = { maxLength: 2000, supportsEmbeds: true };
        break;
      case 'gmail':
      case 'outlook':
        limits.email = { subjectMaxLength: 78, supportsHtml: true };
        break;
      case 'github':
      case 'gitlab':
        limits.github = { titleMaxLength: 256, supportsMarkdown: true };
        break;
    }

    return limits;
  }

  /**
   * Determine context requirements for field generation
   */
  private static determineContextRequirements(fieldType: FieldType, field: any): ContextRequirement[] {
    const requirements: ContextRequirement[] = [];

    switch (fieldType) {
      case FieldType.SUBJECT:
      case FieldType.TITLE:
        requirements.push({
          type: 'trigger_data',
          field: 'content',
          required: true,
          fallback: 'Generated Title'
        });
        break;

      case FieldType.BODY:
      case FieldType.MESSAGE:
        requirements.push({
          type: 'trigger_data',
          required: true
        });
        break;

      case FieldType.EMAIL:
        requirements.push({
          type: 'trigger_data',
          field: 'email',
          required: false,
          fallback: 'user@example.com'
        });
        break;

      case FieldType.DATE:
        requirements.push({
          type: 'trigger_data',
          field: 'timestamp',
          required: false,
          fallback: new Date().toISOString()
        });
        break;

      case FieldType.TAGS:
        requirements.push({
          type: 'trigger_data',
          required: false,
          fallback: 'automated'
        });
        break;
    }

    return requirements;
  }

  /**
   * Determine generation strategy for field type and platform
   */
  private static determineGenerationStrategy(
    fieldType: FieldType, 
    actionType: string, 
    providerId: string
  ): GenerationStrategy {
    const baseStrategy: GenerationStrategy = {
      promptTemplate: '',
      tone: 'formal',
      length: 'medium',
      includeContext: true,
      requiresValidation: true
    };

    // Platform-specific tone adjustments
    switch (providerId) {
      case 'slack':
      case 'discord':
        baseStrategy.tone = 'casual';
        break;
      case 'twitter':
      case 'linkedin':
        baseStrategy.tone = 'marketing';
        break;
      case 'github':
      case 'gitlab':
        baseStrategy.tone = 'technical';
        break;
      default:
        baseStrategy.tone = 'formal';
    }

    // Field-specific adjustments
    switch (fieldType) {
      case FieldType.SUBJECT:
      case FieldType.TITLE:
        baseStrategy.length = 'short';
        baseStrategy.promptTemplate = 'Generate a concise, descriptive {fieldType} based on: {context}';
        break;

      case FieldType.BODY:
      case FieldType.MESSAGE:
        baseStrategy.length = 'long';
        baseStrategy.promptTemplate = 'Generate a well-structured {fieldType} responding to: {context}';
        break;

      case FieldType.TAGS:
        baseStrategy.length = 'short';
        baseStrategy.promptTemplate = 'Generate relevant tags/keywords for: {context}';
        break;

      default:
        baseStrategy.promptTemplate = 'Generate appropriate {fieldType} content for: {context}';
    }

    return baseStrategy;
  }

  /**
   * Get all fillable fields from an action schema
   */
  static getFillableFields(actionSchema: any): Array<{ field: any; classification: FieldClassification }> {
    if (!actionSchema.configSchema) return [];

    return actionSchema.configSchema
      .map((field: any) => ({
        field,
        classification: this.classifyField(field, actionSchema.type, actionSchema.providerId)
      }))
      .filter(({ classification }) => classification.priority !== FieldPriority.SKIP);
  }

  /**
   * Prioritize fields for generation order
   */
  static prioritizeFields(
    fieldsWithClassification: Array<{ field: any; classification: FieldClassification }>
  ): Array<{ field: any; classification: FieldClassification }> {
    const priorityOrder = [
      FieldPriority.CRITICAL,
      FieldPriority.HIGH,
      FieldPriority.MEDIUM,
      FieldPriority.LOW
    ];

    return fieldsWithClassification.sort((a, b) => {
      const aPriorityIndex = priorityOrder.indexOf(a.classification.priority);
      const bPriorityIndex = priorityOrder.indexOf(b.classification.priority);
      return aPriorityIndex - bPriorityIndex;
    });
  }
}