/**
 * Test Agent Output - Comprehensive Testing Suite
 * 
 * Validates AI agent functionality with edge cases, malformed inputs,
 * and scenario coverage to ensure robust production performance.
 */

import { FieldClassifier, FieldType, FieldPriority } from '../schema/fieldClassifier';
import { PromptGenerator } from '../ai/promptGenerator';
import { SafetyValidator } from '../ai/safetyValidator';
import { FallbackHandler } from '../ai/fallbackHandler';
import { TokenBudgetManager } from '../ai/tokenBudgetManager';

export interface TestCase {
  name: string;
  description: string;
  input: TestInput;
  expectedBehavior: ExpectedBehavior;
  platforms: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface TestInput {
  actionType: string;
  providerId: string;
  field: any;
  triggerData?: any;
  previousResults?: any;
  userPreferences?: any;
}

export interface ExpectedBehavior {
  shouldSucceed: boolean;
  expectedFieldType?: FieldType;
  expectedPriority?: FieldPriority;
  maxLength?: number;
  shouldTriggerFallback?: boolean;
  shouldRequireValidation?: boolean;
  expectedFlags?: string[];
  shouldSplit?: boolean;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  actualOutput?: any;
  executionTime: number;
  memoryUsage?: number;
}

export interface TestSuiteResult {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
  coverage: TestCoverage;
  executionTime: number;
}

export interface TestCoverage {
  fieldTypes: Set<FieldType>;
  platforms: Set<string>;
  scenarios: Set<string>;
  edgeCases: Set<string>;
}

/**
 * Comprehensive Test Suite for Smart AI Agent
 */
export class AgentTestSuite {
  
  /**
   * Run complete test suite
   */
  static async runTestSuite(options: {
    includePerformanceTests?: boolean;
    includeStressTests?: boolean;
    verbose?: boolean;
  } = {}): Promise<TestSuiteResult> {
    console.log('🧪 Starting Smart AI Agent Test Suite...');
    const startTime = Date.now();
    
    const testCases = this.getAllTestCases();
    const results: TestResult[] = [];
    const coverage: TestCoverage = {
      fieldTypes: new Set(),
      platforms: new Set(),
      scenarios: new Set(),
      edgeCases: new Set()
    };

    for (const testCase of testCases) {
      if (options.verbose) {
        console.log(`\n🔬 Running test: ${testCase.name}`);
      }
      
      const result = await this.runSingleTest(testCase);
      results.push(result);
      
      // Track coverage
      if (testCase.expectedBehavior.expectedFieldType) {
        coverage.fieldTypes.add(testCase.expectedBehavior.expectedFieldType);
      }
      testCase.platforms.forEach(p => coverage.platforms.add(p));
      coverage.scenarios.add(testCase.description);
      
      if (options.verbose) {
        console.log(`${result.passed ? '✅' : '❌'} ${testCase.name}: ${result.passed ? 'PASSED' : 'FAILED'}`);
        if (!result.passed) {
          result.errors.forEach(error => console.log(`   Error: ${error}`));
        }
      }
    }

    // Performance tests
    if (options.includePerformanceTests) {
      const perfResults = await this.runPerformanceTests();
      results.push(...perfResults);
    }

    // Stress tests
    if (options.includeStressTests) {
      const stressResults = await this.runStressTests();
      results.push(...stressResults);
    }

    const executionTime = Date.now() - startTime;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    const suiteResult: TestSuiteResult = {
      totalTests: results.length,
      passed,
      failed,
      skipped: 0,
      results,
      coverage,
      executionTime
    };

    this.printSummary(suiteResult, options.verbose);
    return suiteResult;
  }

  /**
   * Run a single test case
   */
  private static async runSingleTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let actualOutput: any = {};

    try {
      // Test 1: Field Classification
      const classification = FieldClassifier.classifyField(
        testCase.input.field,
        testCase.input.actionType,
        testCase.input.providerId
      );

      actualOutput.classification = classification;

      // Validate expected field type
      if (testCase.expectedBehavior.expectedFieldType &&
          classification.type !== testCase.expectedBehavior.expectedFieldType) {
        errors.push(`Expected field type ${testCase.expectedBehavior.expectedFieldType}, got ${classification.type}`);
      }

      // Validate expected priority
      if (testCase.expectedBehavior.expectedPriority &&
          classification.priority !== testCase.expectedBehavior.expectedPriority) {
        errors.push(`Expected priority ${testCase.expectedBehavior.expectedPriority}, got ${classification.priority}`);
      }

      // Test 2: Prompt Generation
      if (testCase.input.triggerData) {
        const promptContext = {
          triggerData: testCase.input.triggerData,
          previousResults: testCase.input.previousResults || {},
          userPreferences: testCase.input.userPreferences || {},
          platformContext: {
            providerId: testCase.input.providerId,
            actionType: testCase.input.actionType
          }
        };

        const prompt = PromptGenerator.generateFieldPrompt(
          testCase.input.field,
          classification,
          promptContext
        );

        actualOutput.prompt = prompt;

        // Validate prompt generation
        if (!prompt.systemPrompt || !prompt.userPrompt) {
          errors.push('Prompt generation failed - missing system or user prompt');
        }

        if (prompt.constraints.length === 0 && classification.constraints.maxLength) {
          warnings.push('Expected constraints but none were generated');
        }
      }

      // Test 3: Token Budget Management
      const budget = TokenBudgetManager.calculateTokenBudget(
        classification.type,
        testCase.input.providerId
      );

      actualOutput.budget = budget;

      // Validate token budget
      if (testCase.expectedBehavior.maxLength && 
          budget.maxCharacters > testCase.expectedBehavior.maxLength * 2) {
        warnings.push(`Budget seems too generous: ${budget.maxCharacters} vs expected ~${testCase.expectedBehavior.maxLength}`);
      }

      // Test 4: Safety Validation (with mock content)
      const mockContent = this.generateMockContent(classification.type, testCase.input.providerId);
      const safetyResult = await SafetyValidator.validateContent(
        mockContent,
        testCase.input.field,
        classification,
        testCase.input.triggerData
      );

      actualOutput.safetyValidation = safetyResult;

      // Validate safety expectations
      if (testCase.expectedBehavior.expectedFlags) {
        const actualFlags = safetyResult.flags.map(f => f.type);
        testCase.expectedBehavior.expectedFlags.forEach(expectedFlag => {
          if (!actualFlags.includes(expectedFlag)) {
            errors.push(`Expected safety flag '${expectedFlag}' but it wasn't detected`);
          }
        });
      }

      // Test 5: Fallback Handling
      if (testCase.expectedBehavior.shouldTriggerFallback) {
        const fallbackContext = {
          field: testCase.input.field,
          classification,
          triggerData: testCase.input.triggerData || {},
          previousResults: testCase.input.previousResults || {},
          userPreferences: testCase.input.userPreferences || {},
          platformContext: { providerId: testCase.input.providerId }
        };

        const fallbackResult = await FallbackHandler.handleFallback(fallbackContext);
        actualOutput.fallback = fallbackResult;

        if (!fallbackResult.success && classification.priority === FieldPriority.CRITICAL) {
          errors.push('Fallback failed for critical field');
        }
      }

      // Test 6: Content Splitting
      if (testCase.expectedBehavior.shouldSplit) {
        const longContent = 'Lorem ipsum '.repeat(100); // Generate long content
        const splitResult = TokenBudgetManager.splitContent(
          longContent,
          testCase.input.providerId,
          classification.type
        );

        actualOutput.splitResult = splitResult;

        if (splitResult.chunks.length === 1) {
          warnings.push('Expected content to be split but it was not');
        }
      }

    } catch (error: any) {
      errors.push(`Test execution failed: ${error.message}`);
    }

    const executionTime = Date.now() - startTime;
    const passed = errors.length === 0;

    return {
      testName: testCase.name,
      passed,
      errors,
      warnings,
      actualOutput,
      executionTime
    };
  }

  /**
   * Generate comprehensive test cases
   */
  private static getAllTestCases(): TestCase[] {
    return [
      ...this.getFieldClassificationTests(),
      ...this.getPromptGenerationTests(),
      ...this.getSafetyValidationTests(),
      ...this.getFallbackHandlingTests(),
      ...this.getTokenBudgetTests(),
      ...this.getEdgeCaseTests(),
      ...this.getPlatformSpecificTests()
    ];
  }

  /**
   * Field Classification Test Cases
   */
  private static getFieldClassificationTests(): TestCase[] {
    return [
      {
        name: 'gmail_subject_classification',
        description: 'Gmail subject field should be classified as SUBJECT with HIGH priority',
        input: {
          actionType: 'gmail_action_send_email',
          providerId: 'gmail',
          field: { name: 'subject', label: 'Subject', type: 'text', required: true }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFieldType: FieldType.SUBJECT,
          expectedPriority: FieldPriority.HIGH,
          maxLength: 78
        },
        platforms: ['gmail'],
        severity: 'critical'
      },
      {
        name: 'slack_message_classification',
        description: 'Slack message field should be classified as MESSAGE',
        input: {
          actionType: 'slack_action_send_message',
          providerId: 'slack',
          field: { name: 'text', label: 'Message', type: 'textarea', required: true }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFieldType: FieldType.MESSAGE,
          expectedPriority: FieldPriority.HIGH
        },
        platforms: ['slack'],
        severity: 'high'
      },
      {
        name: 'github_title_classification',
        description: 'GitHub issue title should be classified as TITLE',
        input: {
          actionType: 'github_action_create_issue',
          providerId: 'github',
          field: { name: 'title', label: 'Issue Title', type: 'text', required: true }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFieldType: FieldType.TITLE,
          expectedPriority: FieldPriority.HIGH,
          maxLength: 256
        },
        platforms: ['github'],
        severity: 'high'
      },
      {
        name: 'email_field_classification',
        description: 'Email fields should be classified as EMAIL type',
        input: {
          actionType: 'gmail_action_send_email',
          providerId: 'gmail',
          field: { name: 'to', label: 'Recipients', type: 'email', required: true }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFieldType: FieldType.EMAIL,
          expectedPriority: FieldPriority.MEDIUM
        },
        platforms: ['gmail', 'outlook'],
        severity: 'medium'
      }
    ];
  }

  /**
   * Prompt Generation Test Cases
   */
  private static getPromptGenerationTests(): TestCase[] {
    return [
      {
        name: 'discord_message_prompt',
        description: 'Discord message prompt should include casual tone and emoji guidance',
        input: {
          actionType: 'discord_action_send_message',
          providerId: 'discord',
          field: { name: 'content', label: 'Message', type: 'discord-rich-text' },
          triggerData: { message: { content: 'Hello team!', author: { username: 'testuser' } } },
          userPreferences: { tone: 'casual', includeEmojis: true }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFieldType: FieldType.MESSAGE
        },
        platforms: ['discord'],
        severity: 'medium'
      },
      {
        name: 'professional_email_prompt',
        description: 'Professional email prompt should use formal tone',
        input: {
          actionType: 'gmail_action_send_email',
          providerId: 'gmail',
          field: { name: 'body', label: 'Body', type: 'email-rich-text' },
          triggerData: { subject: 'Meeting Request', from: 'client@example.com' },
          userPreferences: { tone: 'formal' }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFieldType: FieldType.BODY
        },
        platforms: ['gmail'],
        severity: 'high'
      }
    ];
  }

  /**
   * Safety Validation Test Cases
   */
  private static getSafetyValidationTests(): TestCase[] {
    return [
      {
        name: 'profanity_detection',
        description: 'Safety validator should detect and flag profanity',
        input: {
          actionType: 'slack_action_send_message',
          providerId: 'slack',
          field: { name: 'text', label: 'Message', type: 'textarea' }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFlags: ['profanity'],
          shouldRequireValidation: true
        },
        platforms: ['slack'],
        severity: 'high'
      },
      {
        name: 'sensitive_data_detection',
        description: 'Safety validator should detect sensitive information',
        input: {
          actionType: 'github_action_create_issue',
          providerId: 'github',
          field: { name: 'body', label: 'Description', type: 'textarea' }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFlags: ['security'],
          shouldRequireValidation: true
        },
        platforms: ['github'],
        severity: 'critical'
      },
      {
        name: 'hallucination_detection',
        description: 'Safety validator should detect AI hallucination patterns',
        input: {
          actionType: 'notion_action_create_page',
          providerId: 'notion',
          field: { name: 'content', label: 'Content', type: 'textarea' }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFlags: ['hallucination'],
          shouldRequireValidation: true
        },
        platforms: ['notion'],
        severity: 'high'
      }
    ];
  }

  /**
   * Fallback Handling Test Cases
   */
  private static getFallbackHandlingTests(): TestCase[] {
    return [
      {
        name: 'missing_context_fallback',
        description: 'Fallback should handle missing trigger data gracefully',
        input: {
          actionType: 'gmail_action_send_email',
          providerId: 'gmail',
          field: { name: 'subject', label: 'Subject', type: 'text', required: true },
          triggerData: null
        },
        expectedBehavior: {
          shouldSucceed: true,
          shouldTriggerFallback: true
        },
        platforms: ['gmail'],
        severity: 'high'
      },
      {
        name: 'malformed_context_fallback',
        description: 'Fallback should handle malformed input data',
        input: {
          actionType: 'slack_action_send_message',
          providerId: 'slack',
          field: { name: 'text', label: 'Message', type: 'textarea' },
          triggerData: { invalid: 'data', circular: null }
        },
        expectedBehavior: {
          shouldSucceed: true,
          shouldTriggerFallback: true
        },
        platforms: ['slack'],
        severity: 'medium'
      },
      {
        name: 'critical_field_fallback',
        description: 'Critical fields should request user input when fallback fails',
        input: {
          actionType: 'stripe_action_create_payment',
          providerId: 'stripe',
          field: { name: 'amount', label: 'Amount', type: 'number', required: true },
          triggerData: {}
        },
        expectedBehavior: {
          shouldSucceed: true,
          shouldTriggerFallback: true
        },
        platforms: ['stripe'],
        severity: 'critical'
      }
    ];
  }

  /**
   * Token Budget Test Cases
   */
  private static getTokenBudgetTests(): TestCase[] {
    return [
      {
        name: 'twitter_length_limit',
        description: 'Twitter content should respect 280 character limit',
        input: {
          actionType: 'twitter_action_post',
          providerId: 'twitter',
          field: { name: 'text', label: 'Tweet', type: 'textarea' }
        },
        expectedBehavior: {
          shouldSucceed: true,
          maxLength: 280,
          shouldSplit: false
        },
        platforms: ['twitter'],
        severity: 'critical'
      },
      {
        name: 'slack_long_message_split',
        description: 'Long Slack messages should be split appropriately',
        input: {
          actionType: 'slack_action_send_message',
          providerId: 'slack',
          field: { name: 'text', label: 'Message', type: 'textarea' }
        },
        expectedBehavior: {
          shouldSucceed: true,
          shouldSplit: true
        },
        platforms: ['slack'],
        severity: 'medium'
      },
      {
        name: 'email_subject_length',
        description: 'Email subjects should respect best practice length',
        input: {
          actionType: 'gmail_action_send_email',
          providerId: 'gmail',
          field: { name: 'subject', label: 'Subject', type: 'text' }
        },
        expectedBehavior: {
          shouldSucceed: true,
          maxLength: 78
        },
        platforms: ['gmail', 'outlook'],
        severity: 'medium'
      }
    ];
  }

  /**
   * Edge Case Test Cases
   */
  private static getEdgeCaseTests(): TestCase[] {
    return [
      {
        name: 'empty_field_name',
        description: 'Handle fields with empty or missing names',
        input: {
          actionType: 'generic_action',
          providerId: 'generic',
          field: { name: '', label: '', type: 'text' }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFieldType: FieldType.GENERIC
        },
        platforms: ['generic'],
        severity: 'low'
      },
      {
        name: 'unknown_field_type',
        description: 'Handle unknown field types gracefully',
        input: {
          actionType: 'custom_action',
          providerId: 'custom',
          field: { name: 'custom_field', label: 'Custom', type: 'unknown_type' }
        },
        expectedBehavior: {
          shouldSucceed: true,
          expectedFieldType: FieldType.GENERIC
        },
        platforms: ['custom'],
        severity: 'medium'
      },
      {
        name: 'circular_reference_data',
        description: 'Handle circular references in trigger data',
        input: {
          actionType: 'test_action',
          providerId: 'test',
          field: { name: 'test', label: 'Test', type: 'text' },
          triggerData: { circular: {} }
        },
        expectedBehavior: {
          shouldSucceed: true,
          shouldTriggerFallback: true
        },
        platforms: ['test'],
        severity: 'medium'
      }
    ];
  }

  /**
   * Platform-Specific Test Cases
   */
  private static getPlatformSpecificTests(): TestCase[] {
    return [
      {
        name: 'discord_embed_support',
        description: 'Discord should support embed formatting',
        input: {
          actionType: 'discord_action_send_message',
          providerId: 'discord',
          field: { name: 'content', label: 'Message', type: 'discord-rich-text' }
        },
        expectedBehavior: {
          shouldSucceed: true
        },
        platforms: ['discord'],
        severity: 'low'
      },
      {
        name: 'github_markdown_support',
        description: 'GitHub should support markdown formatting',
        input: {
          actionType: 'github_action_create_issue',
          providerId: 'github',
          field: { name: 'body', label: 'Description', type: 'textarea' }
        },
        expectedBehavior: {
          shouldSucceed: true
        },
        platforms: ['github'],
        severity: 'low'
      }
    ];
  }

  /**
   * Performance Test Cases
   */
  private static async runPerformanceTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Test classification performance
    const classificationStart = Date.now();
    for (let i = 0; i < 100; i++) {
      FieldClassifier.classifyField(
        { name: `field_${i}`, label: `Field ${i}`, type: 'text' },
        'test_action',
        'test_provider'
      );
    }
    const classificationTime = Date.now() - classificationStart;
    
    results.push({
      testName: 'classification_performance',
      passed: classificationTime < 1000, // Should complete 100 classifications in <1s
      errors: classificationTime >= 1000 ? [`Classification took ${classificationTime}ms, expected <1000ms`] : [],
      warnings: [],
      executionTime: classificationTime
    });

    // Test prompt generation performance
    const promptStart = Date.now();
    const mockContext = {
      triggerData: { test: 'data' },
      previousResults: {},
      userPreferences: {},
      platformContext: { providerId: 'test', actionType: 'test' }
    };
    
    for (let i = 0; i < 50; i++) {
      const classification = FieldClassifier.classifyField(
        { name: 'test', label: 'Test', type: 'text' },
        'test',
        'test'
      );
      PromptGenerator.generateFieldPrompt(
        { name: 'test', label: 'Test', type: 'text' },
        classification,
        mockContext
      );
    }
    const promptTime = Date.now() - promptStart;
    
    results.push({
      testName: 'prompt_generation_performance',
      passed: promptTime < 2000, // Should complete 50 prompts in <2s
      errors: promptTime >= 2000 ? [`Prompt generation took ${promptTime}ms, expected <2000ms`] : [],
      warnings: [],
      executionTime: promptTime
    });

    return results;
  }

  /**
   * Stress Test Cases
   */
  private static async runStressTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Large content stress test
    const largeContent = 'Lorem ipsum dolor sit amet. '.repeat(1000);
    const stressStart = Date.now();
    
    try {
      const budget = TokenBudgetManager.calculateTokenBudget('body', 'slack');
      const splitResult = TokenBudgetManager.splitContent(largeContent, 'slack', 'body');
      const stressTime = Date.now() - stressStart;
      
      results.push({
        testName: 'large_content_stress_test',
        passed: splitResult.chunks.length > 0 && stressTime < 5000,
        errors: stressTime >= 5000 ? [`Large content processing took ${stressTime}ms, expected <5000ms`] : [],
        warnings: [],
        executionTime: stressTime
      });
    } catch (error: any) {
      results.push({
        testName: 'large_content_stress_test',
        passed: false,
        errors: [`Stress test failed: ${error.message}`],
        warnings: [],
        executionTime: Date.now() - stressStart
      });
    }

    return results;
  }

  /**
   * Generate mock content for testing
   */
  private static generateMockContent(fieldType: FieldType, providerId: string): string {
    const templates: Record<FieldType, Record<string, string>> = {
      [FieldType.SUBJECT]: {
        default: 'Test Subject Line',
        gmail: 'Re: Important Meeting Update'
      },
      [FieldType.BODY]: {
        default: 'This is test content for validation.',
        slack: '👋 Hey team! This is a test message with emojis.',
        profanity: 'This damn content contains mild profanity for testing.'
      },
      [FieldType.MESSAGE]: {
        default: 'Test message content',
        security: 'My SSN is 123-45-6789 and password is secret123'
      }
    };

    const platformTemplates = templates[fieldType];
    if (!platformTemplates) return 'Test content';
    
    return platformTemplates[providerId] || platformTemplates.default;
  }

  /**
   * Print test suite summary
   */
  private static printSummary(result: TestSuiteResult, verbose: boolean): void {
    console.log('\n📊 Test Suite Summary');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${result.totalTests}`);
    console.log(`✅ Passed: ${result.passed}`);
    console.log(`❌ Failed: ${result.failed}`);
    console.log(`⏩ Skipped: ${result.skipped}`);
    console.log(`⏱️  Execution Time: ${result.executionTime}ms`);
    console.log(`📈 Success Rate: ${((result.passed / result.totalTests) * 100).toFixed(1)}%`);
    
    console.log('\n🎯 Coverage:');
    console.log(`Field Types: ${result.coverage.fieldTypes.size} (${Array.from(result.coverage.fieldTypes).join(', ')})`);
    console.log(`Platforms: ${result.coverage.platforms.size} (${Array.from(result.coverage.platforms).join(', ')})`);
    console.log(`Scenarios: ${result.coverage.scenarios.size}`);
    
    if (result.failed > 0) {
      console.log('\n❌ Failed Tests:');
      result.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  ${r.testName}:`);
          r.errors.forEach(error => console.log(`    - ${error}`));
        });
    }

    if (verbose) {
      console.log('\n⚠️  All Warnings:');
      result.results.forEach(r => {
        if (r.warnings.length > 0) {
          console.log(`  ${r.testName}:`);
          r.warnings.forEach(warning => console.log(`    - ${warning}`));
        }
      });
    }
  }
}

/**
 * Quick test runner for development
 */
export async function runQuickTests(): Promise<boolean> {
  console.log('🚀 Running Quick Tests...');
  
  const result = await AgentTestSuite.runTestSuite({
    includePerformanceTests: false,
    includeStressTests: false,
    verbose: false
  });
  
  return result.failed === 0;
}

/**
 * Full test suite runner
 */
export async function runFullTests(): Promise<TestSuiteResult> {
  console.log('🎯 Running Full Test Suite...');
  
  return await AgentTestSuite.runTestSuite({
    includePerformanceTests: true,
    includeStressTests: true,
    verbose: true
  });
}

// Export for CLI usage
if (require.main === module) {
  runFullTests().then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  });
}