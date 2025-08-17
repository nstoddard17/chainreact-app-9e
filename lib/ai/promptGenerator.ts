import { ClassifiedField } from './fieldClassifier';
import { ExtractionContext } from './smartAIAgent';

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  context: ExtractionContext['format'][];
  variables: string[];
  examples?: PromptExample[];
}

export interface PromptExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface PromptGenerationOptions {
  includeExamples: boolean;
  maxExamples: number;
  verboseInstructions: boolean;
  includeHints: boolean;
  adaptiveLength: boolean;
  retryOptimization: boolean;
}

export interface GeneratedPrompt {
  content: string;
  metadata: {
    templateUsed: string;
    wordCount: number;
    estimatedTokens: number;
    complexity: 'simple' | 'moderate' | 'complex';
    adaptations: string[];
  };
}

export class PromptGenerator {
  private templates: Map<string, PromptTemplate>;
  private contextAdaptations: Map<string, (prompt: string, context: ExtractionContext) => string>;
  private retryStrategies: Map<number, (prompt: string, fields: ClassifiedField[]) => string>;

  constructor() {
    this.initializeTemplates();
    this.initializeContextAdaptations();
    this.initializeRetryStrategies();
  }

  generateExtractionPrompt(
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext,
    isRetry: boolean = false,
    options: Partial<PromptGenerationOptions> = {}
  ): GeneratedPrompt {
    const opts: PromptGenerationOptions = {
      includeExamples: true,
      maxExamples: 3,
      verboseInstructions: false,
      includeHints: true,
      adaptiveLength: true,
      retryOptimization: isRetry,
      ...options
    };

    // Select appropriate template
    const template = this.selectTemplate(context, fields);
    
    // Generate base prompt
    let prompt = this.generateBasePrompt(template, input, fields, context, opts);

    // Apply context-specific adaptations
    prompt = this.applyContextAdaptations(prompt, context);

    // Apply retry optimizations if needed
    if (isRetry && context.previousAttempts) {
      prompt = this.applyRetryOptimizations(prompt, fields, context.previousAttempts);
    }

    // Apply length optimizations
    if (opts.adaptiveLength) {
      prompt = this.optimizePromptLength(prompt, fields.length);
    }

    const metadata = {
      templateUsed: template.id,
      wordCount: prompt.split(' ').length,
      estimatedTokens: Math.ceil(prompt.length / 4),
      complexity: this.assessPromptComplexity(fields),
      adaptations: this.getAppliedAdaptations(context, isRetry)
    };

    return {
      content: prompt,
      metadata
    };
  }

  private selectTemplate(context: ExtractionContext, fields: ClassifiedField[]): PromptTemplate {
    // Priority order for template selection
    const priorities = [
      context.format,
      'universal'
    ];

    for (const priority of priorities) {
      for (const template of this.templates.values()) {
        if (template.context.includes(priority as any)) {
          return template;
        }
      }
    }

    // Fallback to universal template
    return this.templates.get('universal')!;
  }

  private generateBasePrompt(
    template: PromptTemplate,
    input: string,
    fields: ClassifiedField[],
    context: ExtractionContext,
    options: PromptGenerationOptions
  ): string {
    const variables = {
      INPUT: input,
      FIELDS: this.generateFieldsDescription(fields, options),
      CONTEXT: this.generateContextDescription(context),
      INSTRUCTIONS: this.generateInstructions(fields, options),
      EXAMPLES: options.includeExamples ? this.generateExamples(template, fields, options.maxExamples) : '',
      OUTPUT_FORMAT: this.generateOutputFormat(fields),
      HINTS: options.includeHints ? this.generateHints(fields) : ''
    };

    let prompt = template.template;
    
    // Replace variables in template
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      prompt = prompt.replace(new RegExp(placeholder, 'g'), value);
    }

    return prompt;
  }

  private generateFieldsDescription(fields: ClassifiedField[], options: PromptGenerationOptions): string {
    const priorityOrder = ['high', 'medium', 'low'] as const;
    let description = '';

    for (const priority of priorityOrder) {
      const priorityFields = fields.filter(f => f.priority === priority);
      if (priorityFields.length === 0) continue;

      description += `\n### ${priority.toUpperCase()} PRIORITY FIELDS:\n`;
      
      for (const field of priorityFields) {
        description += `- **${field.name}** (${field.type})`;
        
        if (field.required) {
          description += ' [REQUIRED]';
        }
        
        if (field.description) {
          description += `: ${field.description}`;
        }
        
        if (field.examples && field.examples.length > 0) {
          description += ` (examples: ${field.examples.slice(0, 2).join(', ')})`;
        }
        
        description += '\n';
      }
    }

    return description;
  }

  private generateContextDescription(context: ExtractionContext): string {
    let description = `Source: ${context.source}`;
    
    if (context.domain) {
      description += `\nDomain: ${context.domain}`;
    }
    
    if (context.format) {
      description += `\nFormat: ${context.format}`;
    }
    
    if (context.language && context.language !== 'en') {
      description += `\nLanguage: ${context.language}`;
    }
    
    if (context.userInstructions) {
      description += `\nUser Instructions: ${context.userInstructions}`;
    }

    return description;
  }

  private generateInstructions(fields: ClassifiedField[], options: PromptGenerationOptions): string {
    let instructions = 'Extract the following information from the provided input:\n\n';
    
    if (options.verboseInstructions) {
      instructions += `
EXTRACTION GUIDELINES:
1. Extract values exactly as they appear in the source
2. For missing fields, use null or leave empty
3. Maintain original formatting when possible
4. Handle multiple values as arrays when specified
5. Pay special attention to required fields
6. Use field hints to guide extraction
7. Be conservative with confidence - only extract if certain
8. Preserve data types as specified in the schema
`;
    }

    // Add complexity-specific instructions
    const complexFields = fields.filter(f => f.complexity === 'complex');
    if (complexFields.length > 0) {
      instructions += '\nCOMPLEX FIELD HANDLING:\n';
      for (const field of complexFields) {
        instructions += `- ${field.name}: ${this.getComplexityInstructions(field)}\n`;
      }
    }

    // Add dependency instructions
    const dependentFields = fields.filter(f => f.dependencies && f.dependencies.length > 0);
    if (dependentFields.length > 0) {
      instructions += '\nFIELD DEPENDENCIES:\n';
      for (const field of dependentFields) {
        instructions += `- ${field.name} depends on: ${field.dependencies!.join(', ')}\n`;
      }
    }

    return instructions;
  }

  private generateExamples(template: PromptTemplate, fields: ClassifiedField[], maxExamples: number): string {
    if (!template.examples || template.examples.length === 0) {
      return this.generateSyntheticExamples(fields, maxExamples);
    }

    let examples = '\nEXAMPLES:\n\n';
    
    const relevantExamples = template.examples.slice(0, maxExamples);
    
    for (let i = 0; i < relevantExamples.length; i++) {
      const example = relevantExamples[i];
      examples += `Example ${i + 1}:\n`;
      examples += `Input: ${example.input}\n`;
      examples += `Output: ${example.output}\n`;
      
      if (example.explanation) {
        examples += `Explanation: ${example.explanation}\n`;
      }
      
      examples += '\n';
    }

    return examples;
  }

  private generateSyntheticExamples(fields: ClassifiedField[], maxExamples: number): string {
    const examples = [];
    
    // Generate simple synthetic examples based on field types
    for (let i = 0; i < Math.min(maxExamples, 2); i++) {
      const exampleData: Record<string, any> = {};
      
      for (const field of fields.slice(0, 5)) { // Limit to first 5 fields for brevity
        if (field.examples && field.examples.length > 0) {
          exampleData[field.name] = field.examples[0];
        } else {
          exampleData[field.name] = this.generateSyntheticValue(field);
        }
      }
      
      examples.push(`Example ${i + 1}: ${JSON.stringify(exampleData, null, 2)}`);
    }

    return examples.length > 0 ? '\nEXAMPLES:\n' + examples.join('\n\n') : '';
  }

  private generateSyntheticValue(field: ClassifiedField): any {
    switch (field.type) {
      case 'string':
        return field.name.includes('name') ? 'John Doe' : 'Sample Text';
      case 'number':
        return field.name.includes('price') || field.name.includes('amount') ? 100.00 : 42;
      case 'boolean':
        return true;
      case 'email':
        return 'user@example.com';
      case 'url':
        return 'https://example.com';
      case 'date':
        return '2024-01-15T10:30:00Z';
      case 'array':
        return ['item1', 'item2'];
      case 'object':
        return { key: 'value' };
      default:
        return null;
    }
  }

  private generateOutputFormat(fields: ClassifiedField[]): string {
    let format = '\nOUTPUT FORMAT:\nRespond with a valid JSON object containing the extracted fields:\n\n';
    
    const exampleOutput: Record<string, any> = {};
    
    for (const field of fields) {
      if (field.required) {
        exampleOutput[field.name] = `<${field.type}_value>`;
      } else {
        exampleOutput[field.name] = `<${field.type}_value_or_null>`;
      }
    }

    format += '```json\n' + JSON.stringify(exampleOutput, null, 2) + '\n```\n';
    
    format += '\nIMPORTANT: Return ONLY the JSON object, no additional text or explanation.';
    
    return format;
  }

  private generateHints(fields: ClassifiedField[]): string {
    let hints = '\nEXTRACTION HINTS:\n';
    
    for (const field of fields) {
      if (field.extractionHints.length > 0) {
        hints += `\n${field.name}:\n`;
        for (const hint of field.extractionHints) {
          hints += `  - ${hint}\n`;
        }
      }
    }

    // Add general hints based on field types
    const typeHints = this.generateTypeSpecificHints(fields);
    if (typeHints) {
      hints += '\nGENERAL TYPE HINTS:\n' + typeHints;
    }

    return hints;
  }

  private generateTypeSpecificHints(fields: ClassifiedField[]): string {
    const typeGroups = fields.reduce((groups, field) => {
      if (!groups[field.type]) groups[field.type] = [];
      groups[field.type].push(field.name);
      return groups;
    }, {} as Record<string, string[]>);

    let hints = '';
    
    for (const [type, fieldNames] of Object.entries(typeGroups)) {
      switch (type) {
        case 'email':
          hints += `- Email fields (${fieldNames.join(', ')}): Look for @ symbols and domain names\n`;
          break;
        case 'date':
          hints += `- Date fields (${fieldNames.join(', ')}): Accept various formats (YYYY-MM-DD, MM/DD/YYYY, etc.)\n`;
          break;
        case 'number':
          hints += `- Number fields (${fieldNames.join(', ')}): Remove commas, currency symbols, and units\n`;
          break;
        case 'array':
          hints += `- Array fields (${fieldNames.join(', ')}): Split on commas, semicolons, or line breaks\n`;
          break;
        case 'boolean':
          hints += `- Boolean fields (${fieldNames.join(', ')}): Look for yes/no, true/false, checked/unchecked\n`;
          break;
      }
    }

    return hints;
  }

  private getComplexityInstructions(field: ClassifiedField): string {
    switch (field.complexity) {
      case 'complex':
        if (field.type === 'array') {
          return 'Split multi-value content carefully, handle nested structures';
        } else if (field.type === 'object') {
          return 'Extract as structured object, maintain key-value relationships';
        }
        return 'Requires careful extraction, may span multiple sections';
      case 'moderate':
        return 'May require pattern matching or format conversion';
      default:
        return 'Direct extraction expected';
    }
  }

  private applyContextAdaptations(prompt: string, context: ExtractionContext): string {
    const adaptation = this.contextAdaptations.get(context.format || 'default');
    return adaptation ? adaptation(prompt, context) : prompt;
  }

  private applyRetryOptimizations(prompt: string, fields: ClassifiedField[], attemptNumber: number): string {
    const strategy = this.retryStrategies.get(attemptNumber);
    return strategy ? strategy(prompt, fields) : prompt;
  }

  private optimizePromptLength(prompt: string, fieldCount: number): string {
    const maxLength = this.calculateOptimalPromptLength(fieldCount);
    
    if (prompt.length <= maxLength) {
      return prompt;
    }

    // Truncation strategy: remove least important sections
    let optimized = prompt;
    
    // Remove examples if too long
    if (optimized.length > maxLength) {
      optimized = optimized.replace(/EXAMPLES:[\s\S]*?(?=\n[A-Z])/g, '');
    }
    
    // Simplify hints if still too long
    if (optimized.length > maxLength) {
      optimized = optimized.replace(/EXTRACTION HINTS:[\s\S]*?(?=\n[A-Z])/g, 'EXTRACTION HINTS: [Simplified for brevity]\n');
    }
    
    // Final truncation if necessary
    if (optimized.length > maxLength) {
      optimized = optimized.substring(0, maxLength - 100) + '\n\n[Prompt truncated for length optimization]';
    }

    return optimized;
  }

  private calculateOptimalPromptLength(fieldCount: number): number {
    // Base length + scaling with field count
    const baseLength = 2000;
    const fieldMultiplier = 200;
    return baseLength + (fieldCount * fieldMultiplier);
  }

  private assessPromptComplexity(fields: ClassifiedField[]): 'simple' | 'moderate' | 'complex' {
    const complexityScore = fields.reduce((score, field) => {
      const complexityMap = { simple: 1, moderate: 2, complex: 3 };
      return score + complexityMap[field.complexity];
    }, 0);

    const averageComplexity = complexityScore / fields.length;
    
    if (averageComplexity <= 1.5) return 'simple';
    if (averageComplexity <= 2.5) return 'moderate';
    return 'complex';
  }

  private getAppliedAdaptations(context: ExtractionContext, isRetry: boolean): string[] {
    const adaptations = [];
    
    if (context.format) {
      adaptations.push(`Format-specific: ${context.format}`);
    }
    
    if (context.domain) {
      adaptations.push(`Domain-aware: ${context.domain}`);
    }
    
    if (context.language && context.language !== 'en') {
      adaptations.push(`Language: ${context.language}`);
    }
    
    if (isRetry) {
      adaptations.push(`Retry optimization: attempt ${context.previousAttempts || 1}`);
    }

    return adaptations;
  }

  private initializeTemplates(): void {
    this.templates = new Map([
      ['universal', {
        id: 'universal',
        name: 'Universal Extraction Template',
        template: `You are an expert data extraction AI. Your task is to extract specific information from the provided input text.

{{CONTEXT}}

{{FIELDS}}

{{INSTRUCTIONS}}

{{HINTS}}

{{EXAMPLES}}

INPUT TO ANALYZE:
"""
{{INPUT}}
"""

{{OUTPUT_FORMAT}}`,
        context: ['email', 'document', 'form', 'api', 'web'],
        variables: ['INPUT', 'FIELDS', 'CONTEXT', 'INSTRUCTIONS', 'HINTS', 'EXAMPLES', 'OUTPUT_FORMAT']
      }],
      
      ['email', {
        id: 'email',
        name: 'Email Extraction Template',
        template: `You are an expert email parsing AI. Extract the specified information from the email content below.

EMAIL CONTEXT:
{{CONTEXT}}

FIELDS TO EXTRACT:
{{FIELDS}}

EMAIL PARSING INSTRUCTIONS:
- Parse headers (From, To, Subject, Date) carefully
- Extract body content while preserving formatting
- Handle attachments and embedded content references
- Identify signatures and quoted text sections
- Parse email addresses in various formats

{{HINTS}}

{{EXAMPLES}}

EMAIL CONTENT:
"""
{{INPUT}}
"""

{{OUTPUT_FORMAT}}`,
        context: ['email'],
        variables: ['INPUT', 'FIELDS', 'CONTEXT', 'HINTS', 'EXAMPLES', 'OUTPUT_FORMAT'],
        examples: [
          {
            input: 'From: john@example.com\nTo: jane@example.com\nSubject: Meeting Tomorrow\n\nHi Jane,\n\nLet\'s meet at 2 PM.\n\nBest,\nJohn',
            output: '{"sender": "john@example.com", "recipient": "jane@example.com", "subject": "Meeting Tomorrow", "message": "Hi Jane,\\n\\nLet\'s meet at 2 PM.\\n\\nBest,\\nJohn"}',
            explanation: 'Extracted key email components including sender, recipient, subject, and message body'
          }
        ]
      }],
      
      ['form', {
        id: 'form',
        name: 'Form Data Extraction Template',
        template: `You are an expert form data extraction AI. Extract information from form fields and their values.

FORM CONTEXT:
{{CONTEXT}}

FORM FIELDS TO EXTRACT:
{{FIELDS}}

FORM PARSING INSTRUCTIONS:
- Match field labels with their corresponding values
- Handle various input types (text, select, checkbox, radio)
- Process grouped fields and sections
- Extract validation states and error messages if present
- Handle multi-step or tabbed forms

{{HINTS}}

{{EXAMPLES}}

FORM DATA:
"""
{{INPUT}}
"""

{{OUTPUT_FORMAT}}`,
        context: ['form'],
        variables: ['INPUT', 'FIELDS', 'CONTEXT', 'HINTS', 'EXAMPLES', 'OUTPUT_FORMAT']
      }],
      
      ['document', {
        id: 'document',
        name: 'Document Extraction Template',
        template: `You are an expert document analysis AI. Extract structured information from the document content.

DOCUMENT CONTEXT:
{{CONTEXT}}

INFORMATION TO EXTRACT:
{{FIELDS}}

DOCUMENT PARSING INSTRUCTIONS:
- Analyze document structure (headings, sections, tables)
- Extract information from various document formats
- Handle multi-page documents and page breaks
- Process tables, lists, and formatted content
- Identify document metadata and properties

{{HINTS}}

{{EXAMPLES}}

DOCUMENT CONTENT:
"""
{{INPUT}}
"""

{{OUTPUT_FORMAT}}`,
        context: ['document'],
        variables: ['INPUT', 'FIELDS', 'CONTEXT', 'HINTS', 'EXAMPLES', 'OUTPUT_FORMAT']
      }],
      
      ['api', {
        id: 'api',
        name: 'API Response Extraction Template',
        template: `You are an expert API response parser. Extract specific fields from the API response data.

API CONTEXT:
{{CONTEXT}}

FIELDS TO EXTRACT:
{{FIELDS}}

API PARSING INSTRUCTIONS:
- Parse JSON/XML response structures
- Handle nested objects and arrays
- Extract from headers, body, and metadata
- Process error responses appropriately
- Maintain data type integrity

{{HINTS}}

{{EXAMPLES}}

API RESPONSE:
"""
{{INPUT}}
"""

{{OUTPUT_FORMAT}}`,
        context: ['api'],
        variables: ['INPUT', 'FIELDS', 'CONTEXT', 'HINTS', 'EXAMPLES', 'OUTPUT_FORMAT']
      }],
      
      ['web', {
        id: 'web',
        name: 'Web Content Extraction Template',
        template: `You are an expert web scraping AI. Extract information from web page content.

WEB PAGE CONTEXT:
{{CONTEXT}}

FIELDS TO EXTRACT:
{{FIELDS}}

WEB PARSING INSTRUCTIONS:
- Parse HTML structure and semantic elements
- Extract from various page sections (header, nav, main, footer)
- Handle dynamic content and JavaScript-rendered elements
- Process forms, tables, and interactive components
- Extract metadata and structured data markup

{{HINTS}}

{{EXAMPLES}}

WEB CONTENT:
"""
{{INPUT}}
"""

{{OUTPUT_FORMAT}}`,
        context: ['web'],
        variables: ['INPUT', 'FIELDS', 'CONTEXT', 'HINTS', 'EXAMPLES', 'OUTPUT_FORMAT']
      }]
    ]);
  }

  private initializeContextAdaptations(): void {
    this.contextAdaptations = new Map([
      ['email', (prompt, context) => {
        if (context.language && context.language !== 'en') {
          prompt += `\n\nIMPORTANT: This email is in ${context.language}. Consider language-specific formatting and conventions.`;
        }
        return prompt;
      }],
      
      ['form', (prompt, context) => {
        if (context.metadata?.formType) {
          prompt += `\n\nFORM TYPE: ${context.metadata.formType}. Adjust extraction strategy accordingly.`;
        }
        return prompt;
      }],
      
      ['document', (prompt, context) => {
        if (context.metadata?.documentType) {
          prompt += `\n\nDOCUMENT TYPE: ${context.metadata.documentType}. Use appropriate parsing strategy for this document format.`;
        }
        return prompt;
      }],
      
      ['api', (prompt, context) => {
        if (context.metadata?.apiVersion) {
          prompt += `\n\nAPI VERSION: ${context.metadata.apiVersion}. Consider version-specific field structures.`;
        }
        return prompt;
      }],
      
      ['web', (prompt, context) => {
        if (context.metadata?.pageType) {
          prompt += `\n\nPAGE TYPE: ${context.metadata.pageType}. Focus on relevant page sections for this content type.`;
        }
        return prompt;
      }]
    ]);
  }

  private initializeRetryStrategies(): void {
    this.retryStrategies = new Map([
      [2, (prompt, fields) => {
        const highPriorityFields = fields.filter(f => f.priority === 'high');
        if (highPriorityFields.length > 0) {
          prompt += `\n\nRETRY FOCUS: Previous attempt failed. Pay special attention to these HIGH PRIORITY fields: ${highPriorityFields.map(f => f.name).join(', ')}`;
        }
        return prompt;
      }],
      
      [3, (prompt, fields) => {
        const requiredFields = fields.filter(f => f.required);
        prompt += `\n\nFINAL ATTEMPT: Focus ONLY on REQUIRED fields if necessary: ${requiredFields.map(f => f.name).join(', ')}. Extract partial data if complete extraction is impossible.`;
        return prompt;
      }]
    ]);
  }

  // Public utility methods
  
  addTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  listTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  addContextAdaptation(
    context: string,
    adaptation: (prompt: string, context: ExtractionContext) => string
  ): void {
    this.contextAdaptations.set(context, adaptation);
  }

  addRetryStrategy(
    attemptNumber: number,
    strategy: (prompt: string, fields: ClassifiedField[]) => string
  ): void {
    this.retryStrategies.set(attemptNumber, strategy);
  }

  validateTemplate(template: PromptTemplate): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!template.id || template.id.trim() === '') {
      errors.push('Template ID is required');
    }

    if (!template.name || template.name.trim() === '') {
      errors.push('Template name is required');
    }

    if (!template.template || template.template.trim() === '') {
      errors.push('Template content is required');
    }

    // Check for required variables in template
    const requiredVars = ['INPUT', 'FIELDS', 'OUTPUT_FORMAT'];
    for (const variable of requiredVars) {
      if (!template.template.includes(`{{${variable}}}`)) {
        errors.push(`Template must include {{${variable}}} placeholder`);
      }
    }

    // Validate declared variables exist in template
    for (const variable of template.variables) {
      if (!template.template.includes(`{{${variable}}}`)) {
        errors.push(`Declared variable {{${variable}}} not found in template`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default PromptGenerator;