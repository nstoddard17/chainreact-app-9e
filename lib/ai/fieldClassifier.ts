import { FieldSchema, ExtractionContext } from './smartAIAgent';

export interface ClassifiedField extends FieldSchema {
  priority: 'high' | 'medium' | 'low';
  complexity: 'simple' | 'moderate' | 'complex';
  extractionHints: string[];
  contextualWeight: number;
  dependencyOrder?: number;
}

export interface FieldClassificationResult {
  fields: ClassifiedField[];
  priorityGroups: {
    high: ClassifiedField[];
    medium: ClassifiedField[];
    low: ClassifiedField[];
  };
  dependencyTree: Map<string, string[]>;
  totalComplexity: number;
}

export interface FieldPattern {
  type: FieldSchema['type'];
  patterns: RegExp[];
  indicators: string[];
  commonNames: string[];
  extractionDifficulty: number;
}

export class FieldClassifier {
  private fieldPatterns: Map<FieldSchema['type'], FieldPattern>;
  private contextualKeywords: Map<string, string[]>;
  private priorityRules: PriorityRule[];

  constructor() {
    this.initializeFieldPatterns();
    this.initializeContextualKeywords();
    this.initializePriorityRules();
  }

  classifyFields(schema: FieldSchema[], context: ExtractionContext): FieldClassificationResult {
    const classifiedFields: ClassifiedField[] = [];
    const dependencyTree = new Map<string, string[]>();

    // First pass: basic classification
    for (const field of schema) {
      const classified = this.classifyField(field, context);
      classifiedFields.push(classified);

      // Build dependency tree
      if (field.dependencies) {
        dependencyTree.set(field.name, field.dependencies);
      }
    }

    // Second pass: contextual adjustments
    this.adjustForContext(classifiedFields, context);
    this.adjustForDependencies(classifiedFields, dependencyTree);

    // Group by priority
    const priorityGroups = {
      high: classifiedFields.filter(f => f.priority === 'high'),
      medium: classifiedFields.filter(f => f.priority === 'medium'),
      low: classifiedFields.filter(f => f.priority === 'low')
    };

    // Calculate total complexity
    const totalComplexity = classifiedFields.reduce((sum, field) => {
      const complexityMap = { simple: 1, moderate: 2, complex: 3 };
      return sum + complexityMap[field.complexity];
    }, 0);

    return {
      fields: classifiedFields,
      priorityGroups,
      dependencyTree,
      totalComplexity
    };
  }

  private classifyField(field: FieldSchema, context: ExtractionContext): ClassifiedField {
    const baseClassification: ClassifiedField = {
      ...field,
      priority: field.priority || this.determinePriority(field, context),
      complexity: this.determineComplexity(field, context),
      extractionHints: this.generateExtractionHints(field, context),
      contextualWeight: this.calculateContextualWeight(field, context)
    };

    return baseClassification;
  }

  private determinePriority(field: FieldSchema, context: ExtractionContext): 'high' | 'medium' | 'low' {
    let score = 0;

    // Required fields get higher priority
    if (field.required) score += 30;

    // Apply priority rules
    for (const rule of this.priorityRules) {
      if (rule.condition(field, context)) {
        score += rule.scoreModifier;
      }
    }

    // Context-specific adjustments
    score += this.getContextualPriorityBoost(field, context);

    // Type-based priority
    score += this.getTypePriorityScore(field.type);

    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  private determineComplexity(field: FieldSchema, context: ExtractionContext): 'simple' | 'moderate' | 'complex' {
    let complexityScore = 0;

    // Type complexity
    const typeComplexity = {
      string: 1, number: 1, boolean: 1,
      email: 2, url: 2, date: 2,
      array: 3, object: 4
    };
    complexityScore += typeComplexity[field.type] || 2;

    // Validation complexity
    if (field.validation) complexityScore += 2;

    // Dependency complexity
    if (field.dependencies && field.dependencies.length > 0) {
      complexityScore += field.dependencies.length;
    }

    // Context complexity
    if (context.format === 'email' && ['array', 'object'].includes(field.type)) {
      complexityScore += 2;
    }

    // Pattern complexity for extraction
    const pattern = this.fieldPatterns.get(field.type);
    if (pattern) {
      complexityScore += pattern.extractionDifficulty;
    }

    if (complexityScore <= 3) return 'simple';
    if (complexityScore <= 6) return 'moderate';
    return 'complex';
  }

  private generateExtractionHints(field: FieldSchema, context: ExtractionContext): string[] {
    const hints: string[] = [];

    // Type-specific hints
    const pattern = this.fieldPatterns.get(field.type);
    if (pattern) {
      hints.push(...pattern.indicators);
    }

    // Context-specific hints
    const contextKeywords = this.contextualKeywords.get(context.domain || '') || [];
    if (contextKeywords.length > 0) {
      hints.push(`Context indicators: ${contextKeywords.join(', ')}`);
    }

    // Format-specific hints
    switch (context.format) {
      case 'email':
        hints.push('Look in email headers, subject, body, and signatures');
        break;
      case 'form':
        hints.push('Check form labels, input names, and nearby text');
        break;
      case 'document':
        hints.push('Search in headings, tables, and structured sections');
        break;
      case 'api':
        hints.push('Check JSON keys and nested objects');
        break;
    }

    // Name-based hints
    hints.push(...this.generateNameBasedHints(field.name));

    // Examples as hints
    if (field.examples && field.examples.length > 0) {
      hints.push(`Example values: ${field.examples.slice(0, 3).join(', ')}`);
    }

    return hints;
  }

  private generateNameBasedHints(fieldName: string): string[] {
    const hints: string[] = [];
    const lowercaseName = fieldName.toLowerCase();

    // Common field name patterns
    const namePatterns = {
      email: ['email', 'mail', 'e-mail', '@'],
      name: ['name', 'title', 'label'],
      phone: ['phone', 'tel', 'mobile', 'number'],
      address: ['address', 'location', 'street'],
      date: ['date', 'time', 'created', 'modified'],
      amount: ['amount', 'price', 'cost', 'total', 'sum'],
      id: ['id', 'uuid', 'identifier', 'key']
    };

    for (const [category, patterns] of Object.entries(namePatterns)) {
      if (patterns.some(pattern => lowercaseName.includes(pattern))) {
        hints.push(`Field appears to be ${category}-related`);
        break;
      }
    }

    // Camel case and snake case variations
    const variations = this.generateFieldNameVariations(fieldName);
    if (variations.length > 1) {
      hints.push(`Also look for: ${variations.slice(1).join(', ')}`);
    }

    return hints;
  }

  private generateFieldNameVariations(fieldName: string): string[] {
    const variations = [fieldName];

    // Convert camelCase to snake_case
    const snakeCase = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (snakeCase !== fieldName.toLowerCase()) {
      variations.push(snakeCase);
    }

    // Convert to kebab-case
    const kebabCase = fieldName.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (kebabCase !== fieldName.toLowerCase()) {
      variations.push(kebabCase);
    }

    // Add spaces
    const spacedVersion = fieldName.replace(/([A-Z])/g, ' $1').trim();
    if (spacedVersion !== fieldName) {
      variations.push(spacedVersion);
    }

    return variations;
  }

  private calculateContextualWeight(field: FieldSchema, context: ExtractionContext): number {
    let weight = 1.0;

    // Domain-specific weights
    if (context.domain) {
      const domainKeywords = this.contextualKeywords.get(context.domain) || [];
      if (domainKeywords.some(keyword => 
        field.name.toLowerCase().includes(keyword) || 
        field.description?.toLowerCase().includes(keyword)
      )) {
        weight += 0.5;
      }
    }

    // Format-specific weights
    switch (context.format) {
      case 'email':
        if (['sender', 'recipient', 'subject', 'date'].includes(field.name.toLowerCase())) {
          weight += 0.3;
        }
        break;
      case 'form':
        if (field.required) {
          weight += 0.4;
        }
        break;
      case 'api':
        if (['id', 'status', 'timestamp'].includes(field.name.toLowerCase())) {
          weight += 0.2;
        }
        break;
    }

    // Previous attempt adjustments
    if (context.previousAttempts && context.previousAttempts > 0) {
      if (field.priority === 'high') {
        weight += 0.3; // Boost high priority fields on retries
      }
    }

    return Math.min(weight, 2.0); // Cap at 2.0
  }

  private adjustForContext(fields: ClassifiedField[], context: ExtractionContext): void {
    // Language-specific adjustments
    if (context.language && context.language !== 'en') {
      fields.forEach(field => {
        field.extractionHints.push(`Content language: ${context.language}`);
        if (field.type === 'string') {
          field.complexity = field.complexity === 'simple' ? 'moderate' : field.complexity;
        }
      });
    }

    // User instruction prioritization
    if (context.userInstructions) {
      const instructions = context.userInstructions.toLowerCase();
      fields.forEach(field => {
        if (instructions.includes(field.name.toLowerCase())) {
          field.priority = 'high';
          field.contextualWeight += 0.5;
          field.extractionHints.unshift('Explicitly mentioned in user instructions');
        }
      });
    }
  }

  private adjustForDependencies(fields: ClassifiedField[], dependencyTree: Map<string, string[]>): void {
    // Calculate dependency order
    const dependencyOrder = this.calculateDependencyOrder(dependencyTree);
    
    fields.forEach(field => {
      const order = dependencyOrder.get(field.name);
      if (order !== undefined) {
        field.dependencyOrder = order;
        
        // Boost priority for fields with dependencies
        if (dependencyTree.has(field.name)) {
          if (field.priority === 'low') field.priority = 'medium';
          else if (field.priority === 'medium') field.priority = 'high';
        }
      }
    });
  }

  private calculateDependencyOrder(dependencyTree: Map<string, string[]>): Map<string, number> {
    const order = new Map<string, number>();
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (fieldName: string): number => {
      if (visiting.has(fieldName)) {
        throw new Error(`Circular dependency detected involving field: ${fieldName}`);
      }
      
      if (visited.has(fieldName)) {
        return order.get(fieldName) || 0;
      }

      visiting.add(fieldName);
      let maxDepOrder = 0;

      const dependencies = dependencyTree.get(fieldName) || [];
      for (const dep of dependencies) {
        maxDepOrder = Math.max(maxDepOrder, visit(dep));
      }

      visiting.delete(fieldName);
      visited.add(fieldName);
      
      const fieldOrder = maxDepOrder + 1;
      order.set(fieldName, fieldOrder);
      return fieldOrder;
    };

    // Visit all fields
    for (const fieldName of dependencyTree.keys()) {
      if (!visited.has(fieldName)) {
        visit(fieldName);
      }
    }

    return order;
  }

  private getContextualPriorityBoost(field: FieldSchema, context: ExtractionContext): number {
    let boost = 0;

    // Domain-specific boosts
    if (context.domain) {
      const domainBoosts = {
        'finance': ['amount', 'price', 'cost', 'total', 'balance'],
        'healthcare': ['patient', 'diagnosis', 'medication', 'doctor'],
        'education': ['student', 'grade', 'course', 'school'],
        'ecommerce': ['product', 'price', 'order', 'customer'],
        'hr': ['employee', 'salary', 'department', 'position']
      };

      const relevantFields = domainBoosts[context.domain as keyof typeof domainBoosts] || [];
      if (relevantFields.some(rf => field.name.toLowerCase().includes(rf))) {
        boost += 15;
      }
    }

    return boost;
  }

  private getTypePriorityScore(type: FieldSchema['type']): number {
    const typeScores = {
      string: 5,
      number: 5,
      boolean: 3,
      email: 10,
      url: 8,
      date: 7,
      array: 12,
      object: 15
    };

    return typeScores[type] || 5;
  }

  private initializeFieldPatterns(): void {
    this.fieldPatterns = new Map([
      ['string', {
        type: 'string',
        patterns: [/[a-zA-Z\s]+/, /".+"/],
        indicators: ['Text content', 'String values', 'Names and labels'],
        commonNames: ['name', 'title', 'description', 'text', 'label'],
        extractionDifficulty: 1
      }],
      ['number', {
        type: 'number',
        patterns: [/\d+\.?\d*/, /\$?\d+,?\d*\.?\d*/],
        indicators: ['Numeric values', 'Amounts', 'Quantities', 'IDs'],
        commonNames: ['amount', 'price', 'quantity', 'id', 'count'],
        extractionDifficulty: 1
      }],
      ['boolean', {
        type: 'boolean',
        patterns: [/true|false/i, /yes|no/i, /on|off/i],
        indicators: ['True/false values', 'Yes/no answers', 'Checkboxes'],
        commonNames: ['enabled', 'active', 'visible', 'checked'],
        extractionDifficulty: 2
      }],
      ['email', {
        type: 'email',
        patterns: [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/],
        indicators: ['Email addresses', 'Contact information', '@domain.com'],
        commonNames: ['email', 'mail', 'contact', 'sender', 'recipient'],
        extractionDifficulty: 2
      }],
      ['url', {
        type: 'url',
        patterns: [/https?:\/\/[^\s]+/, /www\.[^\s]+/],
        indicators: ['Web addresses', 'Links', 'http/https URLs'],
        commonNames: ['url', 'link', 'website', 'homepage', 'source'],
        extractionDifficulty: 2
      }],
      ['date', {
        type: 'date',
        patterns: [/\d{4}-\d{2}-\d{2}/, /\d{1,2}\/\d{1,2}\/\d{4}/, /\d{1,2}-\d{1,2}-\d{4}/],
        indicators: ['Date values', 'Timestamps', 'Created/modified dates'],
        commonNames: ['date', 'created', 'modified', 'timestamp', 'time'],
        extractionDifficulty: 3
      }],
      ['array', {
        type: 'array',
        patterns: [/\[.*\]/, /.*,.*,.*/, /.*;\s*.*/],
        indicators: ['Lists', 'Multiple values', 'Comma-separated items'],
        commonNames: ['tags', 'categories', 'items', 'list', 'options'],
        extractionDifficulty: 4
      }],
      ['object', {
        type: 'object',
        patterns: [/\{.*\}/, /.*:.*,.*:.*/],
        indicators: ['Structured data', 'Key-value pairs', 'Nested information'],
        commonNames: ['config', 'settings', 'metadata', 'details', 'properties'],
        extractionDifficulty: 5
      }]
    ]);
  }

  private initializeContextualKeywords(): void {
    this.contextualKeywords = new Map([
      ['finance', ['amount', 'balance', 'payment', 'transaction', 'account', 'bank']],
      ['healthcare', ['patient', 'medical', 'diagnosis', 'treatment', 'doctor', 'hospital']],
      ['education', ['student', 'course', 'grade', 'school', 'teacher', 'class']],
      ['ecommerce', ['product', 'order', 'customer', 'cart', 'checkout', 'payment']],
      ['hr', ['employee', 'salary', 'department', 'manager', 'position', 'benefit']],
      ['legal', ['contract', 'agreement', 'clause', 'party', 'terms', 'condition']],
      ['real-estate', ['property', 'address', 'price', 'listing', 'agent', 'buyer']],
      ['marketing', ['campaign', 'lead', 'conversion', 'audience', 'engagement', 'analytics']]
    ]);
  }

  private initializePriorityRules(): void {
    this.priorityRules = [
      {
        name: 'Required Field Boost',
        condition: (field) => field.required,
        scoreModifier: 20
      },
      {
        name: 'ID Field Priority',
        condition: (field) => field.name.toLowerCase().includes('id'),
        scoreModifier: 15
      },
      {
        name: 'Email Priority',
        condition: (field) => field.type === 'email',
        scoreModifier: 15
      },
      {
        name: 'Name Field Priority',
        condition: (field) => field.name.toLowerCase().includes('name'),
        scoreModifier: 12
      },
      {
        name: 'Date Field Priority',
        condition: (field) => field.type === 'date',
        scoreModifier: 10
      },
      {
        name: 'Complex Type Penalty',
        condition: (field) => ['array', 'object'].includes(field.type),
        scoreModifier: -5
      },
      {
        name: 'Has Dependencies',
        condition: (field) => field.dependencies && field.dependencies.length > 0,
        scoreModifier: 8
      },
      {
        name: 'Has Examples',
        condition: (field) => field.examples && field.examples.length > 0,
        scoreModifier: 5
      },
      {
        name: 'Form Context Boost',
        condition: (field, context) => context.format === 'form' && field.required,
        scoreModifier: 10
      },
      {
        name: 'API Context ID Boost',
        condition: (field, context) => context.format === 'api' && field.name.toLowerCase().includes('id'),
        scoreModifier: 12
      }
    ];
  }

  getFieldPattern(type: FieldSchema['type']): FieldPattern | undefined {
    return this.fieldPatterns.get(type);
  }

  addCustomPattern(type: FieldSchema['type'], pattern: FieldPattern): void {
    this.fieldPatterns.set(type, pattern);
  }

  addContextualKeywords(domain: string, keywords: string[]): void {
    this.contextualKeywords.set(domain, keywords);
  }

  addPriorityRule(rule: PriorityRule): void {
    this.priorityRules.push(rule);
  }

  analyzeFieldDistribution(fields: ClassifiedField[]): FieldAnalysis {
    const analysis: FieldAnalysis = {
      totalFields: fields.length,
      byPriority: {
        high: fields.filter(f => f.priority === 'high').length,
        medium: fields.filter(f => f.priority === 'medium').length,
        low: fields.filter(f => f.priority === 'low').length
      },
      byComplexity: {
        simple: fields.filter(f => f.complexity === 'simple').length,
        moderate: fields.filter(f => f.complexity === 'moderate').length,
        complex: fields.filter(f => f.complexity === 'complex').length
      },
      byType: {},
      averageWeight: fields.reduce((sum, f) => sum + f.contextualWeight, 0) / fields.length,
      recommendations: []
    };

    // Count by type
    fields.forEach(field => {
      analysis.byType[field.type] = (analysis.byType[field.type] || 0) + 1;
    });

    // Generate recommendations
    if (analysis.byComplexity.complex > analysis.totalFields * 0.5) {
      analysis.recommendations.push('Consider simplifying schema - many complex fields detected');
    }

    if (analysis.byPriority.high > analysis.totalFields * 0.7) {
      analysis.recommendations.push('Too many high-priority fields - consider rebalancing priorities');
    }

    if (analysis.averageWeight < 1.2) {
      analysis.recommendations.push('Low contextual relevance - ensure fields match the extraction context');
    }

    return analysis;
  }
}

interface PriorityRule {
  name: string;
  condition: (field: FieldSchema, context?: ExtractionContext) => boolean;
  scoreModifier: number;
}

interface FieldAnalysis {
  totalFields: number;
  byPriority: { high: number; medium: number; low: number; };
  byComplexity: { simple: number; moderate: number; complex: number; };
  byType: Record<string, number>;
  averageWeight: number;
  recommendations: string[];
}

export default FieldClassifier;