/**
 * Safety and Hallucination Control System
 * 
 * Validates AI-generated content for safety, appropriateness, and schema compliance
 * with comprehensive logging and retry mechanisms.
 */

import { FieldType, FieldClassification } from '../schema/fieldClassifier';

import { logger } from '@/lib/utils/logger'

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitizedContent?: string;
  flags: SafetyFlag[];
}

export interface ValidationError {
  type: 'schema' | 'safety' | 'format' | 'length' | 'pattern';
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  field?: string;
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'quality' | 'relevance' | 'tone' | 'formatting';
  message: string;
  suggestion?: string;
}

export interface SafetyFlag {
  type: 'profanity' | 'inappropriate' | 'hallucination' | 'spam' | 'security' | 'privacy';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  autofix?: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
  modifyPrompt: boolean;
  fallbackToTemplate: boolean;
}

/**
 * Safety Validator for AI-generated content
 */
export class SafetyValidator {
  private static readonly PROFANITY_PATTERNS = [
    // Basic patterns - in production, use a comprehensive filter
    /\b(damn|hell|crap)\b/gi,
    // Add more patterns as needed
  ];

  private static readonly HALLUCINATION_INDICATORS = [
    // Patterns that suggest AI hallucination
    /\b(according to my training|as an ai|i don't have access|i cannot|i'm not able)\b/gi,
    /\b(fictional|hypothetical|made-up|example\.com)\b/gi,
    /\{\{[^}]+\}\}/g, // Template variables that weren't replaced
    /\[placeholder\]|\[insert|\[your/gi,
  ];

  private static readonly INAPPROPRIATE_PATTERNS = [
    // Content inappropriate for business contexts
    /\b(urgent|immediate|asap|emergency)\b/gi, // Unless contextually appropriate
    /\b(click here|act now|limited time)\b/gi, // Spam-like language
    /\$\d+|\bfree\b|\bmoney\b/gi, // Financial spam indicators
  ];

  private static readonly SECURITY_PATTERNS = [
    // Patterns that might expose sensitive information
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN pattern
    /\b\d{16}\b/g, // Credit card pattern
    /password|secret|token|key/gi,
    /api[_-]?key|access[_-]?token/gi,
  ];

  /**
   * Validate generated content for safety and compliance
   */
  static async validateContent(
    content: string,
    field: any,
    classification: FieldClassification,
    context: any
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const flags: SafetyFlag[] = [];
    let sanitizedContent = content;
    let confidence = 1.0;

    try {
      // 1. Schema validation
      const schemaValidation = this.validateSchema(content, field, classification);
      errors.push(...schemaValidation.errors);
      warnings.push(...schemaValidation.warnings);
      confidence = Math.min(confidence, schemaValidation.confidence);

      // 2. Safety validation
      const safetyValidation = this.validateSafety(content);
      flags.push(...safetyValidation.flags);
      sanitizedContent = safetyValidation.sanitizedContent;
      confidence = Math.min(confidence, safetyValidation.confidence);

      // 3. Hallucination detection
      const hallucinationValidation = this.detectHallucination(content, context);
      flags.push(...hallucinationValidation.flags);
      confidence = Math.min(confidence, hallucinationValidation.confidence);

      // 4. Content quality validation
      const qualityValidation = this.validateQuality(content, classification);
      warnings.push(...qualityValidation.warnings);
      confidence = Math.min(confidence, qualityValidation.confidence);

      // 5. Platform-specific validation
      const platformValidation = this.validatePlatformCompliance(content, classification);
      errors.push(...platformValidation.errors);
      warnings.push(...platformValidation.warnings);

      // Log validation results
      this.logValidation(content, field.name, errors, warnings, flags, confidence);

      return {
        isValid: errors.length === 0 && flags.filter(f => f.severity === 'critical').length === 0,
        confidence,
        errors,
        warnings,
        sanitizedContent,
        flags
      };

    } catch (error) {
      logger.error('Validation error:', error);
      return {
        isValid: false,
        confidence: 0,
        errors: [{
          type: 'schema',
          message: 'Validation system error',
          severity: 'critical'
        }],
        warnings: [],
        flags: [],
        sanitizedContent: content
      };
    }
  }

  /**
   * Validate content against field schema
   */
  private static validateSchema(
    content: string,
    field: any,
    classification: FieldClassification
  ): { errors: ValidationError[]; warnings: ValidationWarning[]; confidence: number } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let confidence = 1.0;

    // Required field validation
    if (classification.constraints.required && (!content || content.trim().length === 0)) {
      errors.push({
        type: 'schema',
        message: 'Required field cannot be empty',
        severity: 'critical',
        field: field.name
      });
      confidence = 0;
    }

    // Length validation
    if (classification.constraints.maxLength && content.length > classification.constraints.maxLength) {
      errors.push({
        type: 'length',
        message: `Content exceeds maximum length of ${classification.constraints.maxLength} characters`,
        severity: 'high',
        field: field.name,
        suggestion: 'Truncate or rephrase content'
      });
      confidence = 0.3;
    }

    if (classification.constraints.minLength && content.length < classification.constraints.minLength) {
      errors.push({
        type: 'length',
        message: `Content below minimum length of ${classification.constraints.minLength} characters`,
        severity: 'medium',
        field: field.name,
        suggestion: 'Expand content'
      });
      confidence = 0.5;
    }

    // Pattern validation
    if (classification.constraints.pattern) {
      const regex = new RegExp(classification.constraints.pattern);
      if (!regex.test(content)) {
        errors.push({
          type: 'pattern',
          message: `Content does not match required pattern`,
          severity: 'high',
          field: field.name
        });
        confidence = 0.2;
      }
    }

    // Type-specific validation
    switch (classification.type) {
      case FieldType.EMAIL:
        if (!this.isValidEmail(content)) {
          errors.push({
            type: 'format',
            message: 'Invalid email format',
            severity: 'high',
            field: field.name
          });
          confidence = 0.1;
        }
        break;

      case FieldType.URL:
        if (!this.isValidUrl(content)) {
          errors.push({
            type: 'format',
            message: 'Invalid URL format',
            severity: 'high',
            field: field.name
          });
          confidence = 0.1;
        }
        break;

      case FieldType.DATE:
        if (!this.isValidDate(content)) {
          errors.push({
            type: 'format',
            message: 'Invalid date format',
            severity: 'high',
            field: field.name
          });
          confidence = 0.1;
        }
        break;
    }

    return { errors, warnings, confidence };
  }

  /**
   * Validate content for safety issues
   */
  private static validateSafety(
    content: string
  ): { flags: SafetyFlag[]; sanitizedContent: string; confidence: number } {
    const flags: SafetyFlag[] = [];
    let sanitizedContent = content;
    let confidence = 1.0;

    // Check for profanity
    for (const pattern of this.PROFANITY_PATTERNS) {
      if (pattern.test(content)) {
        flags.push({
          type: 'profanity',
          severity: 'medium',
          description: 'Content contains mild profanity',
          autofix: true
        });
        sanitizedContent = sanitizedContent.replace(pattern, '[censored]');
        confidence = 0.7;
      }
    }

    // Check for inappropriate content
    for (const pattern of this.INAPPROPRIATE_PATTERNS) {
      const matches = content.match(pattern);
      if (matches && matches.length > 2) { // Multiple spam indicators
        flags.push({
          type: 'inappropriate',
          severity: 'high',
          description: 'Content appears to be spam-like',
          autofix: false
        });
        confidence = 0.3;
      }
    }

    // Check for security risks
    for (const pattern of this.SECURITY_PATTERNS) {
      if (pattern.test(content)) {
        flags.push({
          type: 'security',
          severity: 'critical',
          description: 'Content may contain sensitive information',
          autofix: true
        });
        sanitizedContent = sanitizedContent.replace(pattern, '[REDACTED]');
        confidence = 0.1;
      }
    }

    return { flags, sanitizedContent, confidence };
  }

  /**
   * Detect AI hallucination patterns
   */
  private static detectHallucination(
    content: string,
    context: any
  ): { flags: SafetyFlag[]; confidence: number } {
    const flags: SafetyFlag[] = [];
    let confidence = 1.0;

    // Check for hallucination indicators
    for (const pattern of this.HALLUCINATION_INDICATORS) {
      if (pattern.test(content)) {
        flags.push({
          type: 'hallucination',
          severity: 'high',
          description: 'Content shows signs of AI hallucination',
          autofix: false
        });
        confidence = 0.2;
      }
    }

    // Check for non-existent fields referenced
    const fieldReferences = content.match(/\{\{[^}]+\}\}/g);
    if (fieldReferences && fieldReferences.length > 0) {
      flags.push({
        type: 'hallucination',
        severity: 'critical',
        description: 'Content contains unresolved template variables',
        autofix: false
      });
      confidence = 0.1;
    }

    // Check for contextual relevance (basic heuristic)
    if (context && context.triggerData) {
      const hasRelevantKeywords = this.checkContextualRelevance(content, context.triggerData);
      if (!hasRelevantKeywords) {
        flags.push({
          type: 'hallucination',
          severity: 'medium',
          description: 'Content may not be relevant to provided context',
          autofix: false
        });
        confidence = 0.5;
      }
    }

    return { flags, confidence };
  }

  /**
   * Validate content quality
   */
  private static validateQuality(
    content: string,
    classification: FieldClassification
  ): { warnings: ValidationWarning[]; confidence: number } {
    const warnings: ValidationWarning[] = [];
    let confidence = 1.0;

    // Check for generic/template language
    const genericPatterns = [
      /lorem ipsum/gi,
      /placeholder/gi,
      /example/gi,
      /test/gi,
      /default/gi
    ];

    for (const pattern of genericPatterns) {
      if (pattern.test(content)) {
        warnings.push({
          type: 'quality',
          message: 'Content appears generic or template-like',
          suggestion: 'Use more specific, contextual language'
        });
        confidence = 0.6;
      }
    }

    // Check for appropriate length relative to field type
    if (classification.type === FieldType.SUBJECT && content.length > 50) {
      warnings.push({
        type: 'quality',
        message: 'Subject line may be too long for optimal readability',
        suggestion: 'Consider shortening to under 50 characters'
      });
      confidence = 0.8;
    }

    if (classification.type === FieldType.BODY && content.length < 20) {
      warnings.push({
        type: 'quality',
        message: 'Message body is very short',
        suggestion: 'Consider adding more detail or context'
      });
      confidence = 0.7;
    }

    return { warnings, confidence };
  }

  /**
   * Validate platform-specific compliance
   */
  private static validatePlatformCompliance(
    content: string,
    classification: FieldClassification
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const platformLimits = classification.constraints.platformLimits;

    if (platformLimits?.twitter && content.length > platformLimits.twitter.maxLength) {
      errors.push({
        type: 'length',
        message: `Content exceeds Twitter's ${platformLimits.twitter.maxLength} character limit`,
        severity: 'critical',
        suggestion: 'Split into multiple tweets or shorten content'
      });
    }

    if (platformLimits?.slack && content.length > platformLimits.slack.maxLength) {
      errors.push({
        type: 'length',
        message: `Content exceeds Slack's ${platformLimits.slack.maxLength} character limit`,
        severity: 'high',
        suggestion: 'Split into multiple messages or shorten content'
      });
    }

    if (platformLimits?.email?.subjectMaxLength && 
        classification.type === FieldType.SUBJECT && 
        content.length > platformLimits.email.subjectMaxLength) {
      warnings.push({
        type: 'formatting',
        message: `Subject line exceeds recommended ${platformLimits.email.subjectMaxLength} characters`,
        suggestion: 'Shorten for better email client display'
      });
    }

    return { errors, warnings };
  }

  /**
   * Check contextual relevance (basic implementation)
   */
  private static checkContextualRelevance(content: string, triggerData: any): boolean {
    if (!triggerData) return true;

    const contentWords = content.toLowerCase().split(/\s+/);
    const triggerText = JSON.stringify(triggerData).toLowerCase();
    const triggerWords = triggerText.split(/\s+/);

    // Simple overlap check - at least 10% word overlap
    const commonWords = contentWords.filter(word => 
      word.length > 3 && triggerWords.some(tw => tw.includes(word))
    );

    return commonWords.length / contentWords.length > 0.1;
  }

  /**
   * Utility validation functions
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private static isValidDate(date: string): boolean {
    const dateObj = new Date(date);
    return !isNaN(dateObj.getTime());
  }

  /**
   * Log validation results for monitoring
   */
  private static logValidation(
    content: string,
    fieldName: string,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    flags: SafetyFlag[],
    confidence: number
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      fieldName,
      contentLength: content.length,
      confidence,
      errorCount: errors.length,
      warningCount: warnings.length,
      flagCount: flags.length,
      errors: errors.map(e => ({ type: e.type, severity: e.severity, message: e.message })),
      flags: flags.map(f => ({ type: f.type, severity: f.severity }))
    };

    // In production, send to monitoring service
    logger.debug('🛡️ Validation Log:', {
      workflowId: logEntry.workflowId,
      nodeId: logEntry.nodeId,
      errorCount: logEntry.errors.length,
      flagCount: logEntry.flags.length
    });

    // Alert on critical issues
    const criticalIssues = [...errors, ...flags].filter(issue => issue.severity === 'critical');
    if (criticalIssues.length > 0) {
      logger.error('🚨 Critical validation issues detected:', criticalIssues);
    }
  }

  /**
   * Generate retry configuration based on validation results
   */
  static getRetryConfig(validationResult: ValidationResult): RetryConfig {
    const criticalErrors = validationResult.errors.filter(e => e.severity === 'critical').length;
    const criticalFlags = validationResult.flags.filter(f => f.severity === 'critical').length;

    if (criticalErrors > 0 || criticalFlags > 0) {
      return {
        maxRetries: 3,
        backoffMs: 1000,
        modifyPrompt: true,
        fallbackToTemplate: true
      };
    }

    if (validationResult.confidence < 0.5) {
      return {
        maxRetries: 2,
        backoffMs: 500,
        modifyPrompt: true,
        fallbackToTemplate: false
      };
    }

    return {
      maxRetries: 1,
      backoffMs: 0,
      modifyPrompt: false,
      fallbackToTemplate: false
    };
  }

  /**
   * Sanitize content for safe output
   */
  static sanitizeContent(content: string, allowedTags: string[] = []): string {
    let sanitized = content;

    // Remove potential XSS patterns
    sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');

    // Clean up formatting
    sanitized = sanitized.trim();
    sanitized = sanitized.replace(/\s+/g, ' '); // Normalize whitespace

    return sanitized;
  }
}