import { securityErrorHandler, SecurityErrorType, SecuritySeverity } from './security-error-handler'

/**
 * Validation rule types
 */
export enum ValidationType {
  REQUIRED = 'required',
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  EMAIL = 'email',
  URL = 'url',
  UUID = 'uuid',
  DATE = 'date',
  OBJECT = 'object',
  ARRAY = 'array',
  ENUM = 'enum',
  REGEX = 'regex',
  LENGTH = 'length',
  RANGE = 'range',
  CUSTOM = 'custom'
}

/**
 * Sanitization types
 */
export enum SanitizationType {
  HTML_ESCAPE = 'html_escape',
  SQL_ESCAPE = 'sql_escape',
  JAVASCRIPT_ESCAPE = 'javascript_escape',
  URL_ENCODE = 'url_encode',
  TRIM = 'trim',
  LOWERCASE = 'lowercase',
  UPPERCASE = 'uppercase',
  ALPHANUMERIC = 'alphanumeric',
  REMOVE_HTML = 'remove_html',
  NORMALIZE_UNICODE = 'normalize_unicode',
  REMOVE_NULL_BYTES = 'remove_null_bytes',
  CUSTOM = 'custom'
}

/**
 * Validation rule configuration
 */
export interface ValidationRule {
  type: ValidationType
  required?: boolean
  message?: string
  options?: {
    min?: number
    max?: number
    pattern?: RegExp | string
    values?: any[]
    validator?: (value: any) => boolean | string
    customMessage?: string
  }
}

/**
 * Sanitization rule configuration
 */
export interface SanitizationRule {
  type: SanitizationType
  options?: {
    preserveWhitespace?: boolean
    allowedTags?: string[]
    customSanitizer?: (value: string) => string
  }
}

/**
 * Field schema definition
 */
export interface FieldSchema {
  validation?: ValidationRule[]
  sanitization?: SanitizationRule[]
  sensitive?: boolean // Mark as sensitive data
  logAccess?: boolean // Log access to this field
  encrypt?: boolean // Encrypt when storing
}

/**
 * Schema definition for objects
 */
export interface ObjectSchema {
  [key: string]: FieldSchema | ObjectSchema
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: Array<{
    field: string
    message: string
    value?: any
    rule: ValidationType
  }>
  sanitized: any
  securityIssues: Array<{
    field: string
    issue: string
    severity: SecuritySeverity
    originalValue: any
    sanitizedValue: any
  }>
}

/**
 * Security context for validation
 */
export interface SecurityContext {
  userId?: string
  ip?: string
  userAgent?: string
  endpoint?: string
  strictMode?: boolean
}

/**
 * Comprehensive input validation and sanitization framework
 */
export class InputValidator {
  private schemas = new Map<string, ObjectSchema>()
  private customValidators = new Map<string, (value: any) => boolean | string>()
  private customSanitizers = new Map<string, (value: string) => string>()

  // Security patterns for detection
  private readonly SECURITY_PATTERNS = {
    SQL_INJECTION: [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)|('|\"|;|--|\||&)/gi,
      /(\bOR\b|\bAND\b)\s+(\d+\s*=\s*\d+|\w+\s*=\s*\w+)/gi,
      /(INFORMATION_SCHEMA|SYS\.TABLES|DUAL)/gi
    ],
    XSS: [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<img[^>]*src\s*=\s*["']?\s*javascript:/gi
    ],
    LDAP_INJECTION: [
      /[()=*]/g,
      /[\x00-\x1F\x7F-\x9F]/g
    ],
    COMMAND_INJECTION: [
      /[;&|`$(){}[\]<>]/g,
      /(\|\||&&|;;)/g,
      /(^|\s)(cat|ls|pwd|whoami|id|uname|wget|curl|nc|netcat|bash|sh|cmd|powershell)\s/gi
    ],
    PATH_TRAVERSAL: [
      /\.\.\/|\.\.\\/g,
      /%2e%2e%2f|%2e%2e%5c/gi,
      /\.\.%2f|\.\.%5c/gi
    ],
    XXE: [
      /<!ENTITY/gi,
      /<!DOCTYPE[^>]*>/gi,
      /SYSTEM\s+["'][^"']*["']/gi
    ]
  }

  constructor() {
    this.initializeCustomValidators()
    this.initializeCustomSanitizers()
    console.log('🔒 Input validator initialized with security patterns')
  }

  /**
   * Register schema for validation
   */
  registerSchema(name: string, schema: ObjectSchema): void {
    this.schemas.set(name, schema)
    console.log(`📋 Schema registered: ${name}`)
  }

  /**
   * Validate and sanitize input data
   */
  async validateAndSanitize(
    data: any,
    schema: ObjectSchema | string,
    context?: SecurityContext
  ): Promise<ValidationResult> {
    const schemaObj = typeof schema === 'string' ? this.schemas.get(schema) : schema
    
    if (!schemaObj) {
      throw new Error(`Schema not found: ${schema}`)
    }

    const result: ValidationResult = {
      valid: true,
      errors: [],
      sanitized: {},
      securityIssues: []
    }

    await this.processObject(data, schemaObj, result, '', context)

    // Overall security check
    if (result.securityIssues.length > 0) {
      const criticalIssues = result.securityIssues.filter(issue => 
        issue.severity === SecuritySeverity.HIGH || issue.severity === SecuritySeverity.CRITICAL
      )
      
      if (criticalIssues.length > 0 && context) {
        securityErrorHandler.handleSecurityError(new Error('Critical security issues detected in input'), {
          ...context,
          metadata: { securityIssues: criticalIssues }
        })
      }
    }

    return result
  }

  /**
   * Validate single field
   */
  async validateField(
    value: any,
    fieldSchema: FieldSchema,
    fieldName: string,
    context?: SecurityContext
  ): Promise<{
    valid: boolean
    errors: string[]
    sanitized: any
    securityIssues: Array<{ issue: string; severity: SecuritySeverity }>
  }> {
    const errors: string[] = []
    const securityIssues: Array<{ issue: string; severity: SecuritySeverity }> = []
    let sanitized = value

    // Apply sanitization first
    if (fieldSchema.sanitization) {
      for (const rule of fieldSchema.sanitization) {
        try {
          sanitized = this.applySanitization(sanitized, rule)
        } catch (error: any) {
          errors.push(`Sanitization failed: ${error.message}`)
        }
      }
    }

    // Security pattern detection
    if (typeof sanitized === 'string') {
      const securityChecks = this.performSecurityChecks(sanitized, fieldName)
      securityIssues.push(...securityChecks)
    }

    // Apply validation rules
    if (fieldSchema.validation) {
      for (const rule of fieldSchema.validation) {
        const validationResult = this.applyValidation(sanitized, rule, fieldName)
        if (validationResult !== true) {
          errors.push(validationResult)
        }
      }
    }

    // Log access to sensitive fields
    if (fieldSchema.logAccess && context) {
      console.log(`🔍 Sensitive field accessed: ${fieldName} by ${context.userId || 'unknown'}`)
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized,
      securityIssues
    }
  }

  /**
   * Quick sanitization for untrusted input
   */
  quickSanitize(input: string, type: 'html' | 'sql' | 'js' | 'url' = 'html'): string {
    switch (type) {
      case 'html':
        return this.escapeHtml(input)
      case 'sql':
        return this.escapeSql(input)
      case 'js':
        return this.escapeJavaScript(input)
      case 'url':
        return encodeURIComponent(input)
      default:
        return input
    }
  }

  /**
   * Batch validation for multiple objects
   */
  async batchValidate(
    items: Array<{ data: any; schema: ObjectSchema | string }>,
    context?: SecurityContext
  ): Promise<Array<ValidationResult & { index: number }>> {
    const results: Array<ValidationResult & { index: number }> = []
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      try {
        const result = await this.validateAndSanitize(item.data, item.schema, context)
        results.push({ ...result, index: i })
      } catch (error: any) {
        results.push({
          index: i,
          valid: false,
          errors: [{ field: 'root', message: error.message, rule: ValidationType.CUSTOM }],
          sanitized: null,
          securityIssues: []
        })
      }
    }
    
    return results
  }

  /**
   * Register custom validator
   */
  registerCustomValidator(name: string, validator: (value: any) => boolean | string): void {
    this.customValidators.set(name, validator)
    console.log(`🔧 Custom validator registered: ${name}`)
  }

  /**
   * Register custom sanitizer
   */
  registerCustomSanitizer(name: string, sanitizer: (value: string) => string): void {
    this.customSanitizers.set(name, sanitizer)
    console.log(`🧹 Custom sanitizer registered: ${name}`)
  }

  /**
   * Process object recursively
   */
  private async processObject(
    data: any,
    schema: ObjectSchema,
    result: ValidationResult,
    path: string,
    context?: SecurityContext
  ): Promise<void> {
    if (data === null || data === undefined) {
      result.sanitized = data
      return
    }

    if (typeof data !== 'object') {
      result.errors.push({
        field: path || 'root',
        message: 'Expected object',
        value: data,
        rule: ValidationType.OBJECT
      })
      result.valid = false
      return
    }

    const sanitizedObject: any = Array.isArray(data) ? [] : {}

    for (const [key, fieldSchema] of Object.entries(schema)) {
      const fieldPath = path ? `${path}.${key}` : key
      const fieldValue = data[key]

      if (this.isFieldSchema(fieldSchema)) {
        // Process field
        const fieldResult = await this.validateField(fieldValue, fieldSchema, fieldPath, context)
        
        if (!fieldResult.valid) {
          result.valid = false
          result.errors.push(...fieldResult.errors.map(error => ({
            field: fieldPath,
            message: error,
            value: fieldValue,
            rule: ValidationType.CUSTOM
          })))
        }

        if (fieldResult.securityIssues.length > 0) {
          result.securityIssues.push(...fieldResult.securityIssues.map(issue => ({
            field: fieldPath,
            issue: issue.issue,
            severity: issue.severity,
            originalValue: fieldValue,
            sanitizedValue: fieldResult.sanitized
          })))
        }

        sanitizedObject[key] = fieldResult.sanitized
      } else {
        // Process nested object
        await this.processObject(fieldValue, fieldSchema, result, fieldPath, context)
        sanitizedObject[key] = result.sanitized
      }
    }

    result.sanitized = sanitizedObject
  }

  /**
   * Check if schema is a field schema or nested object schema
   */
  private isFieldSchema(schema: any): schema is FieldSchema {
    return schema && (schema.validation || schema.sanitization || schema.sensitive !== undefined)
  }

  /**
   * Apply validation rule
   */
  private applyValidation(value: any, rule: ValidationRule, fieldName: string): true | string {
    const { type, required, message, options } = rule

    // Check required
    if (required && (value === null || value === undefined || value === '')) {
      return message || `${fieldName} is required`
    }

    // Skip validation if value is empty and not required
    if (!required && (value === null || value === undefined || value === '')) {
      return true
    }

    switch (type) {
      case ValidationType.STRING:
        if (typeof value !== 'string') {
          return message || `${fieldName} must be a string`
        }
        break

      case ValidationType.NUMBER:
        const num = Number(value)
        if (isNaN(num)) {
          return message || `${fieldName} must be a number`
        }
        if (options?.min !== undefined && num < options.min) {
          return message || `${fieldName} must be at least ${options.min}`
        }
        if (options?.max !== undefined && num > options.max) {
          return message || `${fieldName} must be at most ${options.max}`
        }
        break

      case ValidationType.BOOLEAN:
        if (typeof value !== 'boolean') {
          return message || `${fieldName} must be a boolean`
        }
        break

      case ValidationType.EMAIL:
        if (!this.isValidEmail(value)) {
          return message || `${fieldName} must be a valid email`
        }
        break

      case ValidationType.URL:
        if (!this.isValidUrl(value)) {
          return message || `${fieldName} must be a valid URL`
        }
        break

      case ValidationType.UUID:
        if (!this.isValidUuid(value)) {
          return message || `${fieldName} must be a valid UUID`
        }
        break

      case ValidationType.DATE:
        if (!this.isValidDate(value)) {
          return message || `${fieldName} must be a valid date`
        }
        break

      case ValidationType.ARRAY:
        if (!Array.isArray(value)) {
          return message || `${fieldName} must be an array`
        }
        if (options?.min !== undefined && value.length < options.min) {
          return message || `${fieldName} must have at least ${options.min} items`
        }
        if (options?.max !== undefined && value.length > options.max) {
          return message || `${fieldName} must have at most ${options.max} items`
        }
        break

      case ValidationType.OBJECT:
        if (typeof value !== 'object' || Array.isArray(value)) {
          return message || `${fieldName} must be an object`
        }
        break

      case ValidationType.ENUM:
        if (options?.values && !options.values.includes(value)) {
          return message || `${fieldName} must be one of: ${options.values.join(', ')}`
        }
        break

      case ValidationType.REGEX:
        if (options?.pattern) {
          const pattern = typeof options.pattern === 'string' ? new RegExp(options.pattern) : options.pattern
          if (!pattern.test(String(value))) {
            return message || `${fieldName} format is invalid`
          }
        }
        break

      case ValidationType.LENGTH:
        const strValue = String(value)
        if (options?.min !== undefined && strValue.length < options.min) {
          return message || `${fieldName} must be at least ${options.min} characters`
        }
        if (options?.max !== undefined && strValue.length > options.max) {
          return message || `${fieldName} must be at most ${options.max} characters`
        }
        break

      case ValidationType.CUSTOM:
        if (options?.validator) {
          const result = options.validator(value)
          if (result !== true) {
            return typeof result === 'string' ? result : (message || `${fieldName} validation failed`)
          }
        }
        break
    }

    return true
  }

  /**
   * Apply sanitization rule
   */
  private applySanitization(value: any, rule: SanitizationRule): any {
    if (value === null || value === undefined) {
      return value
    }

    const strValue = String(value)
    const { type, options } = rule

    switch (type) {
      case SanitizationType.HTML_ESCAPE:
        return this.escapeHtml(strValue)

      case SanitizationType.SQL_ESCAPE:
        return this.escapeSql(strValue)

      case SanitizationType.JAVASCRIPT_ESCAPE:
        return this.escapeJavaScript(strValue)

      case SanitizationType.URL_ENCODE:
        return encodeURIComponent(strValue)

      case SanitizationType.TRIM:
        return options?.preserveWhitespace ? strValue : strValue.trim()

      case SanitizationType.LOWERCASE:
        return strValue.toLowerCase()

      case SanitizationType.UPPERCASE:
        return strValue.toUpperCase()

      case SanitizationType.ALPHANUMERIC:
        return strValue.replace(/[^a-zA-Z0-9]/g, '')

      case SanitizationType.REMOVE_HTML:
        return this.removeHtml(strValue, options?.allowedTags)

      case SanitizationType.NORMALIZE_UNICODE:
        return strValue.normalize('NFC')

      case SanitizationType.REMOVE_NULL_BYTES:
        return strValue.replace(/\0/g, '')

      case SanitizationType.CUSTOM:
        if (options?.customSanitizer) {
          return options.customSanitizer(strValue)
        }
        return strValue

      default:
        return value
    }
  }

  /**
   * Perform security checks on input
   */
  private performSecurityChecks(value: string, fieldName: string): Array<{ issue: string; severity: SecuritySeverity }> {
    const issues: Array<{ issue: string; severity: SecuritySeverity }> = []

    // SQL Injection check
    for (const pattern of this.SECURITY_PATTERNS.SQL_INJECTION) {
      if (pattern.test(value)) {
        issues.push({
          issue: `Potential SQL injection in ${fieldName}`,
          severity: SecuritySeverity.CRITICAL
        })
        break
      }
    }

    // XSS check
    for (const pattern of this.SECURITY_PATTERNS.XSS) {
      if (pattern.test(value)) {
        issues.push({
          issue: `Potential XSS attack in ${fieldName}`,
          severity: SecuritySeverity.HIGH
        })
        break
      }
    }

    // Command injection check
    for (const pattern of this.SECURITY_PATTERNS.COMMAND_INJECTION) {
      if (pattern.test(value)) {
        issues.push({
          issue: `Potential command injection in ${fieldName}`,
          severity: SecuritySeverity.CRITICAL
        })
        break
      }
    }

    // Path traversal check
    for (const pattern of this.SECURITY_PATTERNS.PATH_TRAVERSAL) {
      if (pattern.test(value)) {
        issues.push({
          issue: `Potential path traversal in ${fieldName}`,
          severity: SecuritySeverity.HIGH
        })
        break
      }
    }

    // LDAP injection check
    for (const pattern of this.SECURITY_PATTERNS.LDAP_INJECTION) {
      if (pattern.test(value)) {
        issues.push({
          issue: `Potential LDAP injection in ${fieldName}`,
          severity: SecuritySeverity.HIGH
        })
        break
      }
    }

    // XXE check
    for (const pattern of this.SECURITY_PATTERNS.XXE) {
      if (pattern.test(value)) {
        issues.push({
          issue: `Potential XXE attack in ${fieldName}`,
          severity: SecuritySeverity.CRITICAL
        })
        break
      }
    }

    return issues
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
  }

  /**
   * Escape SQL characters
   */
  private escapeSql(value: string): string {
    return value.replace(/'/g, "''").replace(/\\/g, '\\\\')
  }

  /**
   * Escape JavaScript characters
   */
  private escapeJavaScript(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
  }

  /**
   * Remove HTML tags
   */
  private removeHtml(value: string, allowedTags?: string[]): string {
    if (allowedTags && allowedTags.length > 0) {
      const allowedPattern = allowedTags.map(tag => `</?${tag}[^>]*>`).join('|')
      const regex = new RegExp(`<(?!/?(?:${allowedTags.join('|')})[^>]*>)[^>]*>`, 'gi')
      return value.replace(regex, '')
    }
    
    return value.replace(/<[^>]*>/g, '')
  }

  /**
   * Validation helper methods
   */
  private isValidEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value)
  }

  private isValidUrl(value: string): boolean {
    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  }

  private isValidUuid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(value)
  }

  private isValidDate(value: any): boolean {
    const date = new Date(value)
    return !isNaN(date.getTime())
  }

  /**
   * Initialize custom validators
   */
  private initializeCustomValidators(): void {
    this.registerCustomValidator('strongPassword', (value: string) => {
      if (typeof value !== 'string') return 'Password must be a string'
      if (value.length < 8) return 'Password must be at least 8 characters'
      if (!/[A-Z]/.test(value)) return 'Password must contain uppercase letter'
      if (!/[a-z]/.test(value)) return 'Password must contain lowercase letter'
      if (!/[0-9]/.test(value)) return 'Password must contain number'
      if (!/[!@#$%^&*]/.test(value)) return 'Password must contain special character'
      return true
    })

    this.registerCustomValidator('phoneNumber', (value: string) => {
      const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/
      return phoneRegex.test(value) || 'Invalid phone number format'
    })

    this.registerCustomValidator('creditCard', (value: string) => {
      // Basic Luhn algorithm check
      const digits = value.replace(/\D/g, '')
      if (digits.length < 13 || digits.length > 19) return 'Invalid credit card length'
      
      let sum = 0
      let isEven = false
      
      for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i])
        
        if (isEven) {
          digit *= 2
          if (digit > 9) digit -= 9
        }
        
        sum += digit
        isEven = !isEven
      }
      
      return sum % 10 === 0 || 'Invalid credit card number'
    })
  }

  /**
   * Initialize custom sanitizers
   */
  private initializeCustomSanitizers(): void {
    this.registerCustomSanitizer('phoneNumber', (value: string) => {
      return value.replace(/[^\d+\-\(\)\s]/g, '')
    })

    this.registerCustomSanitizer('creditCard', (value: string) => {
      return value.replace(/[^\d]/g, '')
    })

    this.registerCustomSanitizer('filename', (value: string) => {
      return value.replace(/[^a-zA-Z0-9._-]/g, '_')
    })
  }
}

/**
 * Global input validator instance
 */
export const inputValidator = new InputValidator()

/**
 * Validation decorator for automatic input validation
 */
export function ValidateInput(schema: ObjectSchema | string, options: {
  sanitize?: boolean
  strictMode?: boolean
  logViolations?: boolean
} = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (this: any, ...args: any[]) {
      const inputData = args[0] // Assume first argument is the data to validate
      const userId = args[args.length - 1] // Assume last arg is userId
      
      const context: SecurityContext = {
        userId,
        endpoint: propertyName,
        strictMode: options.strictMode
      }

      try {
        const result = await inputValidator.validateAndSanitize(inputData, schema, context)
        
        if (!result.valid) {
          const error = new Error(`Input validation failed: ${result.errors.map(e => e.message).join(', ')}`)
          securityErrorHandler.handleSecurityError(error, {
            ...context,
            metadata: { validationErrors: result.errors }
          })
          throw error
        }

        if (result.securityIssues.length > 0 && options.logViolations) {
          console.warn(`🚨 Security issues detected in ${propertyName}:`, result.securityIssues)
        }

        // Replace original input with sanitized version if requested
        if (options.sanitize) {
          args[0] = result.sanitized
        }

        return await method.apply(this, args)
      } catch (error: any) {
        console.error(`❌ Input validation error in ${propertyName}:`, error.message)
        throw error
      }
    }

    return descriptor
  }
}