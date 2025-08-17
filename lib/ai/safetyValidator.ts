import { ClassifiedField } from './fieldClassifier';
import { ExtractionContext, ValidationResult } from './smartAIAgent';

export interface SafetyConfig {
  enableProfanityFilter: boolean;
  enableHallucinationDetection: boolean;
  enableSchemaValidation: boolean;
  enableContentFilter: boolean;
  enablePIIDetection: boolean;
  strictMode: boolean;
  customRules: SafetyRule[];
}

export interface SafetyRule {
  id: string;
  name: string;
  type: 'content' | 'pattern' | 'value' | 'context';
  severity: 'low' | 'medium' | 'high' | 'critical';
  check: (data: any, field: ClassifiedField, context: ExtractionContext) => SafetyCheckResult;
  description: string;
  enabled: boolean;
}

export interface SafetyCheckResult {
  passed: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  violations: SafetyViolation[];
  confidence: number;
}

export interface SafetyViolation {
  ruleId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  field?: string;
  suggestedAction: 'flag' | 'sanitize' | 'reject' | 'manual_review';
  context?: string;
}

export interface HallucinationIndicator {
  type: 'inconsistency' | 'impossibility' | 'fabrication' | 'pattern_mismatch';
  field: string;
  reason: string;
  confidence: number;
}

export interface PIIDetectionResult {
  detected: boolean;
  types: PIIType[];
  locations: { field: string; type: PIIType; confidence: number }[];
  recommendations: string[];
}

export type PIIType = 'ssn' | 'credit_card' | 'email' | 'phone' | 'address' | 'name' | 'dob' | 'passport' | 'license';

export class SafetyValidator {
  private config: SafetyConfig;
  private profanityPatterns: RegExp[];
  private piiPatterns: Map<PIIType, RegExp[]>;
  private hallucinationDetectors: HallucinationDetector[];
  private contentFilters: ContentFilter[];

  constructor(config: Partial<SafetyConfig> = {}) {
    this.config = {
      enableProfanityFilter: true,
      enableHallucinationDetection: true,
      enableSchemaValidation: true,
      enableContentFilter: true,
      enablePIIDetection: true,
      strictMode: false,
      customRules: [],
      ...config
    };

    this.initializeProfanityPatterns();
    this.initializePIIPatterns();
    this.initializeHallucinationDetectors();
    this.initializeContentFilters();
  }

  async validateOutput(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const safetyFlags: string[] = [];
    let overallRiskLevel: SafetyCheckResult['riskLevel'] = 'none';
    let isValid = true;

    try {
      // 1. Schema validation
      if (this.config.enableSchemaValidation) {
        const schemaResult = this.validateSchema(data, fields);
        if (!schemaResult.passed) {
          isValid = false;
          errors.push(...schemaResult.violations.map(v => v.message));
          safetyFlags.push('schema_mismatch');
        }
      }

      // 2. Hallucination detection
      if (this.config.enableHallucinationDetection) {
        const hallucinationResult = await this.detectHallucinations(data, fields, context);
        if (hallucinationResult.length > 0) {
          const criticalHallucinations = hallucinationResult.filter(h => h.confidence > 0.8);
          if (criticalHallucinations.length > 0) {
            isValid = false;
            errors.push('High-confidence hallucinations detected');
            safetyFlags.push('hallucination_detected');
          } else {
            warnings.push(`Potential hallucinations detected in fields: ${hallucinationResult.map(h => h.field).join(', ')}`);
            safetyFlags.push('possible_hallucination');
          }
        }
      }

      // 3. Profanity filtering
      if (this.config.enableProfanityFilter) {
        const profanityResult = this.detectProfanity(data);
        if (!profanityResult.passed) {
          if (this.config.strictMode) {
            isValid = false;
            errors.push('Profanity detected in extracted content');
          } else {
            warnings.push('Profanity detected - content flagged for review');
          }
          safetyFlags.push('profanity_detected');
        }
      }

      // 4. Content filtering
      if (this.config.enableContentFilter) {
        const contentResult = this.filterContent(data, fields, context);
        if (!contentResult.passed) {
          if (contentResult.riskLevel === 'critical' || contentResult.riskLevel === 'high') {
            isValid = false;
            errors.push('High-risk content detected');
            safetyFlags.push('high_risk_content');
          } else {
            warnings.push('Moderate-risk content detected');
            safetyFlags.push('moderate_risk_content');
          }
          overallRiskLevel = this.combineRiskLevels(overallRiskLevel, contentResult.riskLevel);
        }
      }

      // 5. PII detection
      if (this.config.enablePIIDetection) {
        const piiResult = this.detectPII(data);
        if (piiResult.detected) {
          warnings.push(`PII detected: ${piiResult.types.join(', ')}`);
          safetyFlags.push('pii_detected');
          if (piiResult.types.some(type => ['ssn', 'credit_card', 'passport'].includes(type))) {
            safetyFlags.push('sensitive_pii');
          }
        }
      }

      // 6. Custom rules validation
      for (const rule of this.config.customRules) {
        if (!rule.enabled) continue;

        for (const field of fields) {
          const value = data[field.name];
          if (value !== undefined && value !== null) {
            const ruleResult = rule.check(value, field, context);
            if (!ruleResult.passed) {
              const violation = ruleResult.violations[0];
              if (violation.severity === 'critical' || violation.severity === 'high') {
                if (this.config.strictMode) {
                  isValid = false;
                  errors.push(`Custom rule violation: ${violation.message}`);
                } else {
                  warnings.push(`Custom rule flagged: ${violation.message}`);
                }
              } else {
                warnings.push(`Custom rule warning: ${violation.message}`);
              }
              safetyFlags.push(`custom_rule_${rule.id}`);
            }
          }
        }
      }

      // 7. Overall risk assessment
      if (safetyFlags.includes('high_risk_content') || safetyFlags.includes('hallucination_detected')) {
        safetyFlags.push('high_risk');
      }

      return {
        isValid,
        errors,
        warnings,
        confidence: this.calculateSafetyConfidence(safetyFlags, errors, warnings),
        safetyFlags
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Safety validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings,
        confidence: 0,
        safetyFlags: ['validation_error']
      };
    }
  }

  private validateSchema(data: Record<string, any>, fields: ClassifiedField[]): SafetyCheckResult {
    const violations: SafetyViolation[] = [];

    // Check for required fields
    for (const field of fields) {
      if (field.required && (data[field.name] === undefined || data[field.name] === null || data[field.name] === '')) {
        violations.push({
          ruleId: 'required_field_missing',
          severity: 'high',
          message: `Required field '${field.name}' is missing or empty`,
          field: field.name,
          suggestedAction: 'reject'
        });
      }
    }

    // Check for type mismatches
    for (const field of fields) {
      const value = data[field.name];
      if (value !== undefined && value !== null) {
        if (!this.validateFieldType(value, field.type)) {
          violations.push({
            ruleId: 'type_mismatch',
            severity: 'medium',
            message: `Field '${field.name}' has wrong type. Expected ${field.type}, got ${typeof value}`,
            field: field.name,
            suggestedAction: 'sanitize'
          });
        }
      }
    }

    // Check for unexpected fields
    const expectedFields = new Set(fields.map(f => f.name));
    for (const key of Object.keys(data)) {
      if (!expectedFields.has(key)) {
        violations.push({
          ruleId: 'unexpected_field',
          severity: 'low',
          message: `Unexpected field '${key}' found in output`,
          field: key,
          suggestedAction: 'flag'
        });
      }
    }

    const highSeverityViolations = violations.filter(v => v.severity === 'high' || v.severity === 'critical');
    
    return {
      passed: violations.length === 0,
      riskLevel: highSeverityViolations.length > 0 ? 'high' : violations.length > 0 ? 'medium' : 'none',
      violations,
      confidence: Math.max(0, 100 - (violations.length * 20))
    };
  }

  private validateFieldType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'date':
        return typeof value === 'string' && !isNaN(Date.parse(value));
      case 'email':
        return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'url':
        return typeof value === 'string' && /^https?:\/\/.+/.test(value);
      default:
        return true;
    }
  }

  private async detectHallucinations(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<HallucinationIndicator[]> {
    const indicators: HallucinationIndicator[] = [];

    for (const detector of this.hallucinationDetectors) {
      const result = await detector.detect(data, fields, context);
      indicators.push(...result);
    }

    return indicators;
  }

  private detectProfanity(data: Record<string, any>): SafetyCheckResult {
    const violations: SafetyViolation[] = [];

    for (const [field, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const cleanValue = value.toLowerCase();
        for (const pattern of this.profanityPatterns) {
          if (pattern.test(cleanValue)) {
            violations.push({
              ruleId: 'profanity_detected',
              severity: 'medium',
              message: `Profanity detected in field '${field}'`,
              field,
              suggestedAction: 'sanitize'
            });
            break;
          }
        }
      }
    }

    return {
      passed: violations.length === 0,
      riskLevel: violations.length > 0 ? 'medium' : 'none',
      violations,
      confidence: violations.length === 0 ? 100 : 60
    };
  }

  private filterContent(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): SafetyCheckResult {
    const violations: SafetyViolation[] = [];
    let maxRiskLevel: SafetyCheckResult['riskLevel'] = 'none';

    for (const filter of this.contentFilters) {
      const result = filter.filter(data, fields, context);
      if (!result.passed) {
        violations.push(...result.violations);
        maxRiskLevel = this.combineRiskLevels(maxRiskLevel, result.riskLevel);
      }
    }

    return {
      passed: violations.length === 0,
      riskLevel: maxRiskLevel,
      violations,
      confidence: Math.max(0, 100 - (violations.length * 15))
    };
  }

  private detectPII(data: Record<string, any>): PIIDetectionResult {
    const detectedTypes: PIIType[] = [];
    const locations: { field: string; type: PIIType; confidence: number }[] = [];

    for (const [field, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        for (const [type, patterns] of this.piiPatterns.entries()) {
          for (const pattern of patterns) {
            if (pattern.test(value)) {
              detectedTypes.push(type);
              locations.push({
                field,
                type,
                confidence: this.calculatePIIConfidence(type, value)
              });
              break;
            }
          }
        }
      }
    }

    const uniqueTypes = Array.from(new Set(detectedTypes));
    const recommendations = this.generatePIIRecommendations(uniqueTypes);

    return {
      detected: uniqueTypes.length > 0,
      types: uniqueTypes,
      locations,
      recommendations
    };
  }

  private calculatePIIConfidence(type: PIIType, value: string): number {
    // Enhanced pattern matching for higher confidence
    switch (type) {
      case 'ssn':
        return /^\d{3}-\d{2}-\d{4}$/.test(value) ? 95 : 70;
      case 'credit_card':
        return this.isValidCreditCard(value) ? 90 : 60;
      case 'email':
        return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) ? 85 : 60;
      case 'phone':
        return /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/.test(value) ? 80 : 55;
      default:
        return 60;
    }
  }

  private isValidCreditCard(value: string): boolean {
    // Basic Luhn algorithm check
    const digits = value.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let alternate = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]);
      if (alternate) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      alternate = !alternate;
    }

    return sum % 10 === 0;
  }

  private generatePIIRecommendations(types: PIIType[]): string[] {
    const recommendations: string[] = [];

    if (types.includes('ssn')) {
      recommendations.push('SSN detected - ensure compliance with privacy regulations');
    }
    if (types.includes('credit_card')) {
      recommendations.push('Credit card number detected - implement PCI DSS compliance measures');
    }
    if (types.includes('email')) {
      recommendations.push('Email addresses detected - consider data anonymization');
    }
    if (types.includes('phone')) {
      recommendations.push('Phone numbers detected - verify consent for contact information collection');
    }

    if (types.length > 2) {
      recommendations.push('Multiple PII types detected - conduct comprehensive privacy impact assessment');
    }

    return recommendations;
  }

  private combineRiskLevels(
    level1: SafetyCheckResult['riskLevel'],
    level2: SafetyCheckResult['riskLevel']
  ): SafetyCheckResult['riskLevel'] {
    const hierarchy = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    const maxLevel = Math.max(hierarchy[level1], hierarchy[level2]);
    return Object.keys(hierarchy)[maxLevel] as SafetyCheckResult['riskLevel'];
  }

  private calculateSafetyConfidence(
    safetyFlags: string[],
    errors: string[],
    warnings: string[]
  ): number {
    let confidence = 100;
    
    // Penalty for errors
    confidence -= errors.length * 25;
    
    // Penalty for warnings
    confidence -= warnings.length * 10;
    
    // Penalty for specific safety flags
    const highRiskFlags = ['high_risk', 'hallucination_detected', 'high_risk_content'];
    const mediumRiskFlags = ['possible_hallucination', 'profanity_detected', 'moderate_risk_content'];
    
    confidence -= safetyFlags.filter(flag => highRiskFlags.includes(flag)).length * 20;
    confidence -= safetyFlags.filter(flag => mediumRiskFlags.includes(flag)).length * 10;

    return Math.max(0, confidence);
  }

  private initializeProfanityPatterns(): void {
    // Basic profanity patterns - in production, use a comprehensive library
    this.profanityPatterns = [
      /\b(damn|hell|crap|stupid|idiot)\b/i,
      /\b(f[*@#$]ck|sh[*@#$]t|b[*@#$]tch|a[*@#$]s)\b/i,
      // Add more patterns as needed, preferably from a maintained profanity filter library
    ];
  }

  private initializePIIPatterns(): void {
    this.piiPatterns = new Map([
      ['ssn', [
        /\b\d{3}-\d{2}-\d{4}\b/,
        /\b\d{3}\s\d{2}\s\d{4}\b/,
        /\b\d{9}\b/
      ]],
      ['credit_card', [
        /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/
      ]],
      ['email', [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
      ]],
      ['phone', [
        /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/,
        /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/
      ]],
      ['address', [
        /\b\d+\s+[A-Za-z0-9\s,]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b/i
      ]],
      ['dob', [
        /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12][0-9]|3[01])[-/](?:19|20)\d{2}\b/,
        /\b(?:19|20)\d{2}[-/](?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12][0-9]|3[01])\b/
      ]]
    ]);
  }

  private initializeHallucinationDetectors(): void {
    this.hallucinationDetectors = [
      new ConsistencyDetector(),
      new PatternMatchingDetector(),
      new ContextualValidationDetector(),
      new StatisticalAnomalyDetector()
    ];
  }

  private initializeContentFilters(): void {
    this.contentFilters = [
      new SensitiveContentFilter(),
      new MisinformationFilter(),
      new BiasDetectionFilter(),
      new ContextualAppropriatenessFilter()
    ];
  }

  // Public utility methods

  addCustomRule(rule: SafetyRule): void {
    this.config.customRules.push(rule);
  }

  removeCustomRule(ruleId: string): void {
    this.config.customRules = this.config.customRules.filter(rule => rule.id !== ruleId);
  }

  updateConfig(newConfig: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): SafetyConfig {
    return { ...this.config };
  }

  healthCheck(): boolean {
    return (
      this.profanityPatterns.length > 0 &&
      this.piiPatterns.size > 0 &&
      this.hallucinationDetectors.length > 0 &&
      this.contentFilters.length > 0
    );
  }

  generateSafetyReport(validationResult: ValidationResult): SafetyReport {
    return {
      timestamp: new Date().toISOString(),
      overallRisk: this.assessOverallRisk(validationResult.safetyFlags),
      flaggedIssues: validationResult.safetyFlags.length,
      criticalErrors: validationResult.errors.length,
      warnings: validationResult.warnings.length,
      confidence: validationResult.confidence,
      recommendations: this.generateSafetyRecommendations(validationResult)
    };
  }

  private assessOverallRisk(safetyFlags: string[]): 'low' | 'medium' | 'high' | 'critical' {
    if (safetyFlags.includes('high_risk') || safetyFlags.includes('hallucination_detected')) {
      return 'critical';
    }
    if (safetyFlags.includes('moderate_risk_content') || safetyFlags.includes('possible_hallucination')) {
      return 'high';
    }
    if (safetyFlags.length > 0) {
      return 'medium';
    }
    return 'low';
  }

  private generateSafetyRecommendations(result: ValidationResult): string[] {
    const recommendations: string[] = [];

    if (result.safetyFlags.includes('hallucination_detected')) {
      recommendations.push('Review and validate extracted data against source material');
    }
    if (result.safetyFlags.includes('pii_detected')) {
      recommendations.push('Implement data anonymization and ensure privacy compliance');
    }
    if (result.safetyFlags.includes('profanity_detected')) {
      recommendations.push('Consider content sanitization before processing');
    }
    if (result.safetyFlags.includes('schema_mismatch')) {
      recommendations.push('Verify extraction logic and schema compatibility');
    }

    return recommendations;
  }
}

// Hallucination Detection Classes

abstract class HallucinationDetector {
  abstract detect(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<HallucinationIndicator[]>;
}

class ConsistencyDetector extends HallucinationDetector {
  async detect(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<HallucinationIndicator[]> {
    const indicators: HallucinationIndicator[] = [];

    // Check for internal consistency
    for (const field of fields) {
      if (field.dependencies) {
        for (const dep of field.dependencies) {
          const fieldValue = data[field.name];
          const depValue = data[dep];
          
          if (fieldValue && !depValue) {
            indicators.push({
              type: 'inconsistency',
              field: field.name,
              reason: `Field '${field.name}' has value but dependency '${dep}' is missing`,
              confidence: 0.7
            });
          }
        }
      }
    }

    return indicators;
  }
}

class PatternMatchingDetector extends HallucinationDetector {
  async detect(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<HallucinationIndicator[]> {
    const indicators: HallucinationIndicator[] = [];

    for (const field of fields) {
      const value = data[field.name];
      if (typeof value === 'string' && value.length > 0) {
        // Check for common hallucination patterns
        if (this.containsGenericPlaceholders(value)) {
          indicators.push({
            type: 'fabrication',
            field: field.name,
            reason: 'Contains generic placeholder text',
            confidence: 0.8
          });
        }
        
        if (this.containsImpossibleValues(value, field)) {
          indicators.push({
            type: 'impossibility',
            field: field.name,
            reason: 'Contains impossible or highly unlikely values',
            confidence: 0.9
          });
        }
      }
    }

    return indicators;
  }

  private containsGenericPlaceholders(value: string): boolean {
    const placeholders = [
      'lorem ipsum', 'placeholder', 'example', 'sample',
      'test data', 'dummy', 'xxx', 'n/a', 'tbd', 'pending'
    ];
    const lowerValue = value.toLowerCase();
    return placeholders.some(placeholder => lowerValue.includes(placeholder));
  }

  private containsImpossibleValues(value: string, field: ClassifiedField): boolean {
    if (field.type === 'date') {
      const date = new Date(value);
      const now = new Date();
      const hundredYearsAgo = new Date(now.getFullYear() - 100, now.getMonth(), now.getDate());
      const tenYearsFromNow = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate());
      
      return date < hundredYearsAgo || date > tenYearsFromNow;
    }
    
    if (field.type === 'number') {
      const num = parseFloat(value);
      return !isNaN(num) && (num < 0 && field.name.includes('age')) || (num > 1000000 && field.name.includes('price'));
    }

    return false;
  }
}

class ContextualValidationDetector extends HallucinationDetector {
  async detect(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<HallucinationIndicator[]> {
    const indicators: HallucinationIndicator[] = [];

    // Validate against context expectations
    if (context.domain) {
      for (const field of fields) {
        const value = data[field.name];
        if (value && !this.isValueAppropriateForDomain(value, field, context.domain)) {
          indicators.push({
            type: 'pattern_mismatch',
            field: field.name,
            reason: `Value doesn't match expected patterns for ${context.domain} domain`,
            confidence: 0.6
          });
        }
      }
    }

    return indicators;
  }

  private isValueAppropriateForDomain(value: any, field: ClassifiedField, domain: string): boolean {
    // Domain-specific validation logic
    const domainPatterns: Record<string, Record<string, RegExp[]>> = {
      'finance': {
        'amount': [/^\d+(\.\d{2})?$/],
        'currency': [/^[A-Z]{3}$/]
      },
      'healthcare': {
        'diagnosis': [/^[A-Z]\d{2}(\.\d{1,2})?$/], // ICD-10 pattern
        'medication': [/^[A-Za-z\s-]+$/]
      }
    };

    const patterns = domainPatterns[domain]?.[field.name];
    if (patterns && typeof value === 'string') {
      return patterns.some(pattern => pattern.test(value));
    }

    return true; // No specific validation available
  }
}

class StatisticalAnomalyDetector extends HallucinationDetector {
  async detect(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): Promise<HallucinationIndicator[]> {
    const indicators: HallucinationIndicator[] = [];

    // Statistical analysis for anomalies
    for (const field of fields) {
      const value = data[field.name];
      
      if (typeof value === 'string') {
        // Check for statistical anomalies in text
        if (this.hasAnomalousTextStatistics(value)) {
          indicators.push({
            type: 'fabrication',
            field: field.name,
            reason: 'Text statistics suggest possible fabrication',
            confidence: 0.5
          });
        }
      }
    }

    return indicators;
  }

  private hasAnomalousTextStatistics(text: string): boolean {
    // Basic statistical checks
    if (text.length < 2) return false;
    
    const words = text.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    
    // Anomalous if average word length is too long or too short
    return avgWordLength > 15 || avgWordLength < 2;
  }
}

// Content Filter Classes

abstract class ContentFilter {
  abstract filter(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): SafetyCheckResult;
}

class SensitiveContentFilter extends ContentFilter {
  filter(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): SafetyCheckResult {
    const violations: SafetyViolation[] = [];
    
    const sensitiveKeywords = [
      'password', 'secret', 'token', 'key', 'confidential',
      'classified', 'restricted', 'private'
    ];

    for (const [field, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        for (const keyword of sensitiveKeywords) {
          if (lowerValue.includes(keyword)) {
            violations.push({
              ruleId: 'sensitive_content',
              severity: 'high',
              message: `Sensitive content detected in field '${field}'`,
              field,
              suggestedAction: 'manual_review'
            });
            break;
          }
        }
      }
    }

    return {
      passed: violations.length === 0,
      riskLevel: violations.length > 0 ? 'high' : 'none',
      violations,
      confidence: violations.length === 0 ? 100 : 40
    };
  }
}

class MisinformationFilter extends ContentFilter {
  filter(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): SafetyCheckResult {
    // Placeholder for misinformation detection
    // In production, integrate with fact-checking APIs or ML models
    
    return {
      passed: true,
      riskLevel: 'none',
      violations: [],
      confidence: 70
    };
  }
}

class BiasDetectionFilter extends ContentFilter {
  filter(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): SafetyCheckResult {
    // Placeholder for bias detection
    // In production, implement bias detection algorithms
    
    return {
      passed: true,
      riskLevel: 'none',
      violations: [],
      confidence: 60
    };
  }
}

class ContextualAppropriatenessFilter extends ContentFilter {
  filter(
    data: Record<string, any>,
    fields: ClassifiedField[],
    context: ExtractionContext
  ): SafetyCheckResult {
    const violations: SafetyViolation[] = [];
    
    // Check contextual appropriateness
    if (context.format === 'email' && context.domain === 'business') {
      for (const [field, value] of Object.entries(data)) {
        if (typeof value === 'string' && this.containsInappropriateBusinessContent(value)) {
          violations.push({
            ruleId: 'contextual_inappropriate',
            severity: 'medium',
            message: `Content may be inappropriate for business context in field '${field}'`,
            field,
            suggestedAction: 'flag'
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      riskLevel: violations.length > 0 ? 'medium' : 'none',
      violations,
      confidence: violations.length === 0 ? 90 : 60
    };
  }

  private containsInappropriateBusinessContent(value: string): boolean {
    const inappropriatePatterns = [
      /\b(party|drinking|hangover|drunk)\b/i,
      /\b(sick day|calling in sick|not feeling well)\b/i
    ];
    
    return inappropriatePatterns.some(pattern => pattern.test(value));
  }
}

interface SafetyReport {
  timestamp: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  flaggedIssues: number;
  criticalErrors: number;
  warnings: number;
  confidence: number;
  recommendations: string[];
}

export default SafetyValidator;