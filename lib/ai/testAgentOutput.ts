import SmartAIAgent, { 
  SmartAgentConfig, 
  FieldSchema, 
  ExtractionContext, 
  ExtractionResult,
  AIProviderConfig 
} from './smartAIAgent';
import FieldClassifier from './fieldClassifier';
import PromptGenerator from './promptGenerator';
import SafetyValidator from './safetyValidator';
import FallbackHandler from './fallbackHandler';
import TokenBudgetManager from './tokenBudgetManager';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  category: TestCategory;
  priority: 'high' | 'medium' | 'low';
  input: string;
  schema: FieldSchema[];
  context: ExtractionContext;
  expected: {
    success: boolean;
    data?: Record<string, any>;
    minConfidence?: number;
    maxErrors?: number;
    requiredFields?: string[];
    safetyFlags?: string[];
  };
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  timeout?: number;
}

export type TestCategory = 
  | 'basic_extraction'
  | 'complex_schemas'
  | 'error_handling'
  | 'safety_validation'
  | 'fallback_scenarios'
  | 'token_management'
  | 'performance'
  | 'edge_cases'
  | 'integration'
  | 'regression';

export interface TestResult {
  testId: string;
  passed: boolean;
  executionTime: number;
  error?: string;
  actualResult?: ExtractionResult;
  assertions: AssertionResult[];
  metadata: {
    provider: string;
    model: string;
    tokensUsed: number;
    retries: number;
  };
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  actual: any;
  expected: any;
  message?: string;
}

export interface TestSuiteResult {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  executionTime: number;
  coverage: {
    categories: Record<TestCategory, { total: number; passed: number }>;
    components: Record<string, { total: number; passed: number }>;
  };
  results: TestResult[];
  summary: string;
}

export class SmartAIAgentTestSuite {
  private agent: SmartAIAgent;
  private testCases: Map<string, TestCase>;
  private mockProviders: Map<string, MockAIProvider>;

  constructor() {
    this.testCases = new Map();
    this.mockProviders = new Map();
    this.initializeTestCases();
    this.initializeMockProviders();
    
    // Initialize agent with test configuration
    const testConfig: SmartAgentConfig = {
      aiProvider: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-key',
        maxTokens: 2048,
        temperature: 0.1
      },
      maxRetries: 2,
      timeout: 30000,
      enableSafety: true,
      enableFallback: true,
      enableTokenManagement: true,
      contextWindow: 8192,
      debugMode: true
    };

    this.agent = new SmartAIAgent(testConfig);
  }

  async runAllTests(): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];
    const coverage = this.initializeCoverage();

    console.log('🧪 Starting Smart AI Agent Test Suite...\n');

    for (const testCase of this.testCases.values()) {
      const result = await this.runTest(testCase);
      results.push(result);

      // Update coverage
      const categoryStats = coverage.categories[testCase.category];
      categoryStats.total++;
      if (result.passed) categoryStats.passed++;

      // Log progress
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${testCase.name} (${result.executionTime}ms)`);
      
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }

    const executionTime = Date.now() - startTime;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.filter(r => !r.passed).length;

    const summary = this.generateSummary(results, executionTime);
    console.log('\n' + summary);

    return {
      totalTests: results.length,
      passedTests,
      failedTests,
      skippedTests: 0,
      executionTime,
      coverage,
      results,
      summary
    };
  }

  async runTestCategory(category: TestCategory): Promise<TestResult[]> {
    const categoryTests = Array.from(this.testCases.values())
      .filter(test => test.category === category);

    const results: TestResult[] = [];
    
    console.log(`🧪 Running ${category} tests...\n`);

    for (const testCase of categoryTests) {
      const result = await this.runTest(testCase);
      results.push(result);

      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${testCase.name} (${result.executionTime}ms)`);
    }

    return results;
  }

  async runTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    let actualResult: ExtractionResult | undefined;
    let error: string | undefined;
    const assertions: AssertionResult[] = [];

    try {
      // Setup
      if (testCase.setup) {
        await testCase.setup();
      }

      // Mock AI provider if needed
      const originalCall = this.mockAIProviderCall(testCase);

      // Execute test
      actualResult = await this.agent.extractFields(
        testCase.input,
        testCase.schema,
        testCase.context
      );

      // Restore original method
      if (originalCall) {
        originalCall();
      }

      // Run assertions
      assertions.push(...this.runAssertions(testCase, actualResult));

    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      assertions.push({
        name: 'no_exceptions',
        passed: false,
        actual: error,
        expected: 'no error',
        message: 'Test should not throw exceptions'
      });
    } finally {
      // Teardown
      if (testCase.teardown) {
        await testCase.teardown();
      }
    }

    const executionTime = Date.now() - startTime;
    const passed = assertions.every(a => a.passed);

    return {
      testId: testCase.id,
      passed,
      executionTime,
      error,
      actualResult,
      assertions,
      metadata: {
        provider: actualResult?.metadata.provider || 'unknown',
        model: actualResult?.metadata.model || 'unknown',
        tokensUsed: actualResult?.metadata.tokensUsed || 0,
        retries: actualResult?.metadata.attemptNumber || 1
      }
    };
  }

  private runAssertions(testCase: TestCase, result: ExtractionResult): AssertionResult[] {
    const assertions: AssertionResult[] = [];
    const expected = testCase.expected;

    // Success assertion
    assertions.push({
      name: 'success',
      passed: result.success === expected.success,
      actual: result.success,
      expected: expected.success,
      message: `Expected success: ${expected.success}, got: ${result.success}`
    });

    // Confidence assertion
    if (expected.minConfidence !== undefined) {
      assertions.push({
        name: 'min_confidence',
        passed: result.confidence >= expected.minConfidence,
        actual: result.confidence,
        expected: `>= ${expected.minConfidence}`,
        message: `Confidence should be at least ${expected.minConfidence}%`
      });
    }

    // Error count assertion
    if (expected.maxErrors !== undefined) {
      assertions.push({
        name: 'max_errors',
        passed: result.errors.length <= expected.maxErrors,
        actual: result.errors.length,
        expected: `<= ${expected.maxErrors}`,
        message: `Should have at most ${expected.maxErrors} errors`
      });
    }

    // Required fields assertion
    if (expected.requiredFields) {
      for (const field of expected.requiredFields) {
        const hasField = result.data[field] !== undefined && result.data[field] !== null;
        assertions.push({
          name: `required_field_${field}`,
          passed: hasField,
          actual: hasField ? 'present' : 'missing',
          expected: 'present',
          message: `Required field '${field}' should be extracted`
        });
      }
    }

    // Expected data assertion
    if (expected.data) {
      for (const [key, expectedValue] of Object.entries(expected.data)) {
        const actualValue = result.data[key];
        const matches = this.deepEqual(actualValue, expectedValue);
        assertions.push({
          name: `data_${key}`,
          passed: matches,
          actual: actualValue,
          expected: expectedValue,
          message: `Field '${key}' should match expected value`
        });
      }
    }

    // Safety flags assertion
    if (expected.safetyFlags) {
      for (const flag of expected.safetyFlags) {
        const hasFlag = result.metadata.safetyFlags.includes(flag);
        assertions.push({
          name: `safety_flag_${flag}`,
          passed: hasFlag,
          actual: hasFlag ? 'present' : 'missing',
          expected: 'present',
          message: `Safety flag '${flag}' should be present`
        });
      }
    }

    return assertions;
  }

  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      
      for (const key of keysA) {
        if (!this.deepEqual(a[key], b[key])) return false;
      }
      return true;
    }
    
    return false;
  }

  private mockAIProviderCall(testCase: TestCase): (() => void) | null {
    const mockProvider = this.mockProviders.get(testCase.id);
    if (!mockProvider) return null;

    // Mock the AI provider call method
    const originalMethod = (this.agent as any).callAIProvider;
    (this.agent as any).callAIProvider = async (prompt: string) => {
      return mockProvider.generateResponse(prompt, testCase);
    };

    // Return cleanup function
    return () => {
      (this.agent as any).callAIProvider = originalMethod;
    };
  }

  private initializeCoverage() {
    const categories = [
      'basic_extraction', 'complex_schemas', 'error_handling', 'safety_validation',
      'fallback_scenarios', 'token_management', 'performance', 'edge_cases',
      'integration', 'regression'
    ] as TestCategory[];

    const coverage = {
      categories: {} as Record<TestCategory, { total: number; passed: number }>,
      components: {} as Record<string, { total: number; passed: number }>
    };

    categories.forEach(category => {
      coverage.categories[category] = { total: 0, passed: 0 };
    });

    return coverage;
  }

  private generateSummary(results: TestResult[], executionTime: number): string {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const passRate = ((passed / results.length) * 100).toFixed(1);

    const avgExecutionTime = (results.reduce((sum, r) => sum + r.executionTime, 0) / results.length).toFixed(0);
    const totalTokens = results.reduce((sum, r) => sum + r.metadata.tokensUsed, 0);

    let summary = `📊 Test Suite Summary\n`;
    summary += `===================\n`;
    summary += `Total Tests: ${results.length}\n`;
    summary += `Passed: ${passed} (${passRate}%)\n`;
    summary += `Failed: ${failed}\n`;
    summary += `Execution Time: ${executionTime}ms\n`;
    summary += `Average Test Time: ${avgExecutionTime}ms\n`;
    summary += `Total Tokens Used: ${totalTokens}\n`;

    if (failed > 0) {
      summary += `\n❌ Failed Tests:\n`;
      results.filter(r => !r.passed).forEach(result => {
        summary += `  - ${result.testId}: ${result.error || 'Assertion failed'}\n`;
      });
    }

    return summary;
  }

  private initializeTestCases(): void {
    // Basic Extraction Tests (10 cases)
    this.addBasicExtractionTests();
    
    // Complex Schema Tests (8 cases)
    this.addComplexSchemaTests();
    
    // Error Handling Tests (7 cases)
    this.addErrorHandlingTests();
    
    // Safety Validation Tests (6 cases)
    this.addSafetyValidationTests();
    
    // Fallback Scenario Tests (5 cases)
    this.addFallbackScenarioTests();
    
    // Token Management Tests (4 cases)
    this.addTokenManagementTests();
    
    // Performance Tests (3 cases)
    this.addPerformanceTests();
    
    // Edge Cases Tests (7 cases)
    this.addEdgeCaseTests();
    
    // Integration Tests (3 cases)
    this.addIntegrationTests();
    
    // Regression Tests (3 cases)
    this.addRegressionTests();
  }

  private addBasicExtractionTests(): void {
    // Test 1: Simple string extraction
    this.testCases.set('basic-001', {
      id: 'basic-001',
      name: 'Simple String Extraction',
      description: 'Extract basic string fields from plain text',
      category: 'basic_extraction',
      priority: 'high',
      input: 'Name: John Doe\nAge: 30\nCity: New York',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'age', type: 'number', required: true },
        { name: 'city', type: 'string', required: false }
      ],
      context: { source: 'form', format: 'form' },
      expected: {
        success: true,
        data: { name: 'John Doe', age: 30, city: 'New York' },
        minConfidence: 80,
        requiredFields: ['name', 'age']
      }
    });

    // Test 2: Email extraction
    this.testCases.set('basic-002', {
      id: 'basic-002',
      name: 'Email Field Extraction',
      description: 'Extract email addresses from text',
      category: 'basic_extraction',
      priority: 'high',
      input: 'Contact Information:\nEmail: john.doe@example.com\nPhone: 555-1234',
      schema: [
        { name: 'email', type: 'email', required: true },
        { name: 'phone', type: 'string', required: false }
      ],
      context: { source: 'contact_form', format: 'form' },
      expected: {
        success: true,
        data: { email: 'john.doe@example.com', phone: '555-1234' },
        minConfidence: 75
      }
    });

    // Test 3: Boolean extraction
    this.testCases.set('basic-003', {
      id: 'basic-003',
      name: 'Boolean Field Extraction',
      description: 'Extract boolean values from various formats',
      category: 'basic_extraction',
      priority: 'medium',
      input: 'Newsletter: yes\nNotifications: true\nMarketing: off',
      schema: [
        { name: 'newsletter', type: 'boolean', required: true },
        { name: 'notifications', type: 'boolean', required: true },
        { name: 'marketing', type: 'boolean', required: true }
      ],
      context: { source: 'preferences', format: 'form' },
      expected: {
        success: true,
        data: { newsletter: true, notifications: true, marketing: false },
        minConfidence: 70
      }
    });

    // Test 4: Date extraction
    this.testCases.set('basic-004', {
      id: 'basic-004',
      name: 'Date Field Extraction',
      description: 'Extract dates in various formats',
      category: 'basic_extraction',
      priority: 'medium',
      input: 'Birth Date: 1990-05-15\nJoin Date: 05/20/2020\nLast Login: March 10, 2024',
      schema: [
        { name: 'birthDate', type: 'date', required: true },
        { name: 'joinDate', type: 'date', required: true },
        { name: 'lastLogin', type: 'date', required: false }
      ],
      context: { source: 'profile', format: 'form' },
      expected: {
        success: true,
        minConfidence: 65,
        requiredFields: ['birthDate', 'joinDate']
      }
    });

    // Test 5: URL extraction
    this.testCases.set('basic-005', {
      id: 'basic-005',
      name: 'URL Field Extraction',
      description: 'Extract URL fields from text',
      category: 'basic_extraction',
      priority: 'medium',
      input: 'Website: https://example.com\nBlog: www.myblog.com\nProfile: http://social.example.com/user',
      schema: [
        { name: 'website', type: 'url', required: true },
        { name: 'blog', type: 'url', required: false },
        { name: 'profile', type: 'url', required: false }
      ],
      context: { source: 'social_profile', format: 'form' },
      expected: {
        success: true,
        minConfidence: 70,
        requiredFields: ['website']
      }
    });

    // Test 6: Array extraction
    this.testCases.set('basic-006', {
      id: 'basic-006',
      name: 'Array Field Extraction',
      description: 'Extract array/list fields from text',
      category: 'basic_extraction',
      priority: 'medium',
      input: 'Skills: JavaScript, Python, TypeScript\nHobbies: reading, swimming, coding',
      schema: [
        { name: 'skills', type: 'array', required: true },
        { name: 'hobbies', type: 'array', required: false }
      ],
      context: { source: 'resume', format: 'document' },
      expected: {
        success: true,
        minConfidence: 60,
        requiredFields: ['skills']
      }
    });

    // Test 7: Number extraction with formats
    this.testCases.set('basic-007', {
      id: 'basic-007',
      name: 'Number Field Extraction',
      description: 'Extract numbers in various formats',
      category: 'basic_extraction',
      priority: 'medium',
      input: 'Price: $49.99\nQuantity: 3\nDiscount: 15%\nTotal: 127.47',
      schema: [
        { name: 'price', type: 'number', required: true },
        { name: 'quantity', type: 'number', required: true },
        { name: 'discount', type: 'number', required: false },
        { name: 'total', type: 'number', required: true }
      ],
      context: { source: 'invoice', format: 'document', domain: 'finance' },
      expected: {
        success: true,
        minConfidence: 75,
        requiredFields: ['price', 'quantity', 'total']
      }
    });

    // Test 8: JSON-like extraction
    this.testCases.set('basic-008', {
      id: 'basic-008',
      name: 'JSON-like Structure Extraction',
      description: 'Extract from JSON-like formatted text',
      category: 'basic_extraction',
      priority: 'high',
      input: '{"name": "Alice Smith", "age": 28, "active": true, "email": "alice@test.com"}',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'age', type: 'number', required: true },
        { name: 'active', type: 'boolean', required: true },
        { name: 'email', type: 'email', required: true }
      ],
      context: { source: 'api_response', format: 'api' },
      expected: {
        success: true,
        data: { name: 'Alice Smith', age: 28, active: true, email: 'alice@test.com' },
        minConfidence: 90
      }
    });

    // Test 9: Mixed format extraction
    this.testCases.set('basic-009', {
      id: 'basic-009',
      name: 'Mixed Format Extraction',
      description: 'Extract from mixed text and structured format',
      category: 'basic_extraction',
      priority: 'medium',
      input: 'User Profile\n===========\nFirst Name: Bob\nEmail Address: bob@company.com\nStatus: Active\nJoined: 2023-01-15',
      schema: [
        { name: 'firstName', type: 'string', required: true },
        { name: 'emailAddress', type: 'email', required: true },
        { name: 'status', type: 'string', required: true },
        { name: 'joined', type: 'date', required: false }
      ],
      context: { source: 'profile_document', format: 'document' },
      expected: {
        success: true,
        minConfidence: 70,
        requiredFields: ['firstName', 'emailAddress', 'status']
      }
    });

    // Test 10: Empty and null handling
    this.testCases.set('basic-010', {
      id: 'basic-010',
      name: 'Empty and Null Value Handling',
      description: 'Handle empty fields and null values correctly',
      category: 'basic_extraction',
      priority: 'high',
      input: 'Name: John\nMiddleName: \nLastName: Doe\nNickname: null',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'middleName', type: 'string', required: false },
        { name: 'lastName', type: 'string', required: true },
        { name: 'nickname', type: 'string', required: false }
      ],
      context: { source: 'form_with_empty_fields', format: 'form' },
      expected: {
        success: true,
        minConfidence: 60,
        requiredFields: ['name', 'lastName']
      }
    });
  }

  private addComplexSchemaTests(): void {
    // Test 11: Nested object extraction
    this.testCases.set('complex-001', {
      id: 'complex-001',
      name: 'Nested Object Extraction',
      description: 'Extract nested object structures',
      category: 'complex_schemas',
      priority: 'high',
      input: 'User: John Doe\nAddress: {"street": "123 Main St", "city": "Boston", "zip": "02101"}\nPreferences: {"theme": "dark", "notifications": true}',
      schema: [
        { name: 'user', type: 'string', required: true },
        { name: 'address', type: 'object', required: true },
        { name: 'preferences', type: 'object', required: false }
      ],
      context: { source: 'user_profile', format: 'document' },
      expected: {
        success: true,
        minConfidence: 60,
        requiredFields: ['user', 'address']
      }
    });

    // Test 12: Large schema with dependencies
    this.testCases.set('complex-002', {
      id: 'complex-002',
      name: 'Schema with Field Dependencies',
      description: 'Extract fields with complex dependencies',
      category: 'complex_schemas',
      priority: 'high',
      input: 'Order ID: ORD-12345\nCustomer: Jane Smith\nShipping Address: 456 Oak Ave\nBilling Same as Shipping: No\nBilling Address: 789 Pine St\nTotal: $156.78',
      schema: [
        { name: 'orderId', type: 'string', required: true },
        { name: 'customer', type: 'string', required: true },
        { name: 'shippingAddress', type: 'string', required: true },
        { name: 'billingSameAsShipping', type: 'boolean', required: true },
        { name: 'billingAddress', type: 'string', required: false, dependencies: ['billingSameAsShipping'] },
        { name: 'total', type: 'number', required: true }
      ],
      context: { source: 'order_form', format: 'form', domain: 'ecommerce' },
      expected: {
        success: true,
        minConfidence: 70,
        requiredFields: ['orderId', 'customer', 'total']
      }
    });

    // Test 13: Multiple array fields
    this.testCases.set('complex-003', {
      id: 'complex-003',
      name: 'Multiple Array Field Extraction',
      description: 'Extract multiple array fields with different formats',
      category: 'complex_schemas',
      priority: 'medium',
      input: 'Technologies: [JavaScript, Python, Go]\nCertifications: AWS Certified, Google Cloud Professional, Microsoft Azure\nLanguages: English; Spanish; French\nProjects: Project A, Project B, Project C',
      schema: [
        { name: 'technologies', type: 'array', required: true },
        { name: 'certifications', type: 'array', required: false },
        { name: 'languages', type: 'array', required: false },
        { name: 'projects', type: 'array', required: true }
      ],
      context: { source: 'resume', format: 'document' },
      expected: {
        success: true,
        minConfidence: 65,
        requiredFields: ['technologies', 'projects']
      }
    });

    // Test 14: Mixed data types with validation
    this.testCases.set('complex-004', {
      id: 'complex-004',
      name: 'Mixed Data Types with Validation',
      description: 'Extract complex schema with various validation rules',
      category: 'complex_schemas',
      priority: 'high',
      input: 'Product: Laptop Pro\nSKU: LP-2024-001\nPrice: 1299.99\nInStock: true\nCategories: Electronics, Computers, Laptops\nRating: 4.8\nReviews: 127\nLaunchDate: 2024-03-15',
      schema: [
        { name: 'product', type: 'string', required: true },
        { name: 'sku', type: 'string', required: true },
        { name: 'price', type: 'number', required: true },
        { name: 'inStock', type: 'boolean', required: true },
        { name: 'categories', type: 'array', required: true },
        { name: 'rating', type: 'number', required: false },
        { name: 'reviews', type: 'number', required: false },
        { name: 'launchDate', type: 'date', required: false }
      ],
      context: { source: 'product_catalog', format: 'document', domain: 'ecommerce' },
      expected: {
        success: true,
        minConfidence: 75,
        requiredFields: ['product', 'sku', 'price', 'inStock', 'categories']
      }
    });

    // Test 15: Email with complex structure
    this.testCases.set('complex-005', {
      id: 'complex-005',
      name: 'Complex Email Extraction',
      description: 'Extract from email with headers, body, and signatures',
      category: 'complex_schemas',
      priority: 'high',
      input: `From: sender@company.com
To: recipient@client.com
Subject: Project Update - Q1 2024
Date: Wed, 15 Mar 2024 10:30:00 -0500

Hi Team,

The Q1 project is 85% complete. We expect delivery on March 30, 2024.
Budget remaining: $45,000
Team size: 8 members

Best regards,
John Manager
Senior Project Manager
Company Inc.
Phone: (555) 123-4567`,
      schema: [
        { name: 'sender', type: 'email', required: true },
        { name: 'recipient', type: 'email', required: true },
        { name: 'subject', type: 'string', required: true },
        { name: 'date', type: 'date', required: true },
        { name: 'projectProgress', type: 'number', required: false },
        { name: 'deliveryDate', type: 'date', required: false },
        { name: 'budgetRemaining', type: 'number', required: false },
        { name: 'teamSize', type: 'number', required: false },
        { name: 'senderName', type: 'string', required: false },
        { name: 'senderTitle', type: 'string', required: false },
        { name: 'senderPhone', type: 'string', required: false }
      ],
      context: { source: 'business_email', format: 'email', domain: 'business' },
      expected: {
        success: true,
        minConfidence: 60,
        requiredFields: ['sender', 'recipient', 'subject']
      }
    });

    // Test 16: Form with conditional fields
    this.testCases.set('complex-006', {
      id: 'complex-006',
      name: 'Conditional Field Extraction',
      description: 'Extract form with conditional/dependent fields',
      category: 'complex_schemas',
      priority: 'medium',
      input: 'Account Type: Business\nCompany Name: Tech Solutions Inc\nTax ID: 12-3456789\nEmployee Count: 50\nContact Person: Sarah Johnson\nContact Email: sarah@techsolutions.com',
      schema: [
        { name: 'accountType', type: 'string', required: true },
        { name: 'companyName', type: 'string', required: false, dependencies: ['accountType'] },
        { name: 'taxId', type: 'string', required: false, dependencies: ['accountType'] },
        { name: 'employeeCount', type: 'number', required: false, dependencies: ['accountType'] },
        { name: 'contactPerson', type: 'string', required: true },
        { name: 'contactEmail', type: 'email', required: true }
      ],
      context: { source: 'registration_form', format: 'form', domain: 'business' },
      expected: {
        success: true,
        minConfidence: 70,
        requiredFields: ['accountType', 'contactPerson', 'contactEmail']
      }
    });

    // Test 17: API response with nested arrays
    this.testCases.set('complex-007', {
      id: 'complex-007',
      name: 'API Response with Nested Arrays',
      description: 'Extract complex API response with nested structures',
      category: 'complex_schemas',
      priority: 'medium',
      input: `{
  "user": {
    "id": 12345,
    "name": "Alex Developer",
    "roles": ["admin", "developer", "reviewer"],
    "permissions": {
      "read": true,
      "write": true,
      "delete": false
    }
  },
  "projects": [
    {"name": "Project Alpha", "status": "active"},
    {"name": "Project Beta", "status": "completed"}
  ]
}`,
      schema: [
        { name: 'userId', type: 'number', required: true },
        { name: 'userName', type: 'string', required: true },
        { name: 'userRoles', type: 'array', required: true },
        { name: 'permissions', type: 'object', required: false },
        { name: 'projects', type: 'array', required: false }
      ],
      context: { source: 'api_user_data', format: 'api' },
      expected: {
        success: true,
        minConfidence: 65,
        requiredFields: ['userId', 'userName', 'userRoles']
      }
    });

    // Test 18: Document with tables and sections
    this.testCases.set('complex-008', {
      id: 'complex-008',
      name: 'Document with Tables and Sections',
      description: 'Extract from structured document with multiple sections',
      category: 'complex_schemas',
      priority: 'medium',
      input: `INVOICE
Invoice #: INV-2024-001
Date: March 15, 2024

BILL TO:
ABC Corporation
123 Business Ave
City, ST 12345

ITEMS:
| Description | Qty | Price | Total |
| Consulting  | 10  | 150   | 1500  |
| Software    | 1   | 500   | 500   |

Subtotal: $2000
Tax (8%): $160
Total: $2160`,
      schema: [
        { name: 'invoiceNumber', type: 'string', required: true },
        { name: 'invoiceDate', type: 'date', required: true },
        { name: 'billToCompany', type: 'string', required: true },
        { name: 'billToAddress', type: 'string', required: false },
        { name: 'subtotal', type: 'number', required: true },
        { name: 'tax', type: 'number', required: false },
        { name: 'total', type: 'number', required: true },
        { name: 'items', type: 'array', required: false }
      ],
      context: { source: 'invoice_document', format: 'document', domain: 'finance' },
      expected: {
        success: true,
        minConfidence: 70,
        requiredFields: ['invoiceNumber', 'invoiceDate', 'billToCompany', 'subtotal', 'total']
      }
    });
  }

  private addErrorHandlingTests(): void {
    // Test 19: Missing required fields
    this.testCases.set('error-001', {
      id: 'error-001',
      name: 'Missing Required Fields',
      description: 'Handle extraction when required fields are missing',
      category: 'error_handling',
      priority: 'high',
      input: 'Optional Field: Some Value\nAnother Field: Another Value',
      schema: [
        { name: 'requiredField', type: 'string', required: true },
        { name: 'optionalField', type: 'string', required: false },
        { name: 'anotherField', type: 'string', required: false }
      ],
      context: { source: 'incomplete_form', format: 'form' },
      expected: {
        success: false,
        maxErrors: 5,
        minConfidence: 0
      }
    });

    // Test 20: Type mismatch errors
    this.testCases.set('error-002', {
      id: 'error-002',
      name: 'Type Mismatch Errors',
      description: 'Handle type conversion errors gracefully',
      category: 'error_handling',
      priority: 'high',
      input: 'Age: not a number\nActive: maybe\nPrice: $invalid\nDate: invalid-date-format',
      schema: [
        { name: 'age', type: 'number', required: true },
        { name: 'active', type: 'boolean', required: true },
        { name: 'price', type: 'number', required: false },
        { name: 'date', type: 'date', required: false }
      ],
      context: { source: 'malformed_data', format: 'form' },
      expected: {
        success: false,
        maxErrors: 10
      }
    });

    // Test 21: Empty input handling
    this.testCases.set('error-003', {
      id: 'error-003',
      name: 'Empty Input Handling',
      description: 'Handle completely empty input',
      category: 'error_handling',
      priority: 'medium',
      input: '',
      schema: [
        { name: 'anyField', type: 'string', required: true }
      ],
      context: { source: 'empty_input', format: 'form' },
      expected: {
        success: false,
        maxErrors: 5
      }
    });

    // Test 22: Malformed JSON handling
    this.testCases.set('error-004', {
      id: 'error-004',
      name: 'Malformed JSON Handling',
      description: 'Handle malformed JSON input gracefully',
      category: 'error_handling',
      priority: 'medium',
      input: '{"name": "John", "age": 30, invalid json structure',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'age', type: 'number', required: true }
      ],
      context: { source: 'malformed_api', format: 'api' },
      expected: {
        success: false,
        maxErrors: 5
      }
    });

    // Test 23: Very large input
    this.testCases.set('error-005', {
      id: 'error-005',
      name: 'Large Input Handling',
      description: 'Handle very large input that exceeds token limits',
      category: 'error_handling',
      priority: 'medium',
      input: 'Name: John\n' + 'Additional data: ' + 'x'.repeat(100000),
      schema: [
        { name: 'name', type: 'string', required: true }
      ],
      context: { source: 'large_document', format: 'document' },
      expected: {
        success: true, // Should handle with truncation
        minConfidence: 30
      }
    });

    // Test 24: Invalid email format
    this.testCases.set('error-006', {
      id: 'error-006',
      name: 'Invalid Email Format',
      description: 'Handle invalid email formats',
      category: 'error_handling',
      priority: 'medium',
      input: 'Email: not-an-email\nSecondary Email: also@invalid@format.com',
      schema: [
        { name: 'email', type: 'email', required: true },
        { name: 'secondaryEmail', type: 'email', required: false }
      ],
      context: { source: 'invalid_emails', format: 'form' },
      expected: {
        success: false,
        maxErrors: 3
      }
    });

    // Test 25: Circular dependencies
    this.testCases.set('error-007', {
      id: 'error-007',
      name: 'Circular Dependencies',
      description: 'Handle circular field dependencies',
      category: 'error_handling',
      priority: 'low',
      input: 'Field A: Value A\nField B: Value B',
      schema: [
        { name: 'fieldA', type: 'string', required: true, dependencies: ['fieldB'] },
        { name: 'fieldB', type: 'string', required: true, dependencies: ['fieldA'] }
      ],
      context: { source: 'circular_deps', format: 'form' },
      expected: {
        success: false,
        maxErrors: 5
      }
    });
  }

  private addSafetyValidationTests(): void {
    // Test 26: Profanity detection
    this.testCases.set('safety-001', {
      id: 'safety-001',
      name: 'Profanity Detection',
      description: 'Detect and flag profanity in extracted content',
      category: 'safety_validation',
      priority: 'high',
      input: 'Name: John Doe\nComment: This is damn frustrating',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'comment', type: 'string', required: false }
      ],
      context: { source: 'user_feedback', format: 'form' },
      expected: {
        success: true,
        safetyFlags: ['profanity_detected']
      }
    });

    // Test 27: PII detection
    this.testCases.set('safety-002', {
      id: 'safety-002',
      name: 'PII Detection',
      description: 'Detect personally identifiable information',
      category: 'safety_validation',
      priority: 'high',
      input: 'Name: John Doe\nSSN: 123-45-6789\nCredit Card: 4532-1234-5678-9012',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'ssn', type: 'string', required: false },
        { name: 'creditCard', type: 'string', required: false }
      ],
      context: { source: 'sensitive_form', format: 'form' },
      expected: {
        success: true,
        safetyFlags: ['pii_detected', 'sensitive_pii']
      }
    });

    // Test 28: Schema mismatch detection
    this.testCases.set('safety-003', {
      id: 'safety-003',
      name: 'Schema Mismatch Detection',
      description: 'Detect when output doesn\'t match expected schema',
      category: 'safety_validation',
      priority: 'medium',
      input: 'Name: John\nAge: 30\nUnexpected: This field is not in schema',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'age', type: 'number', required: true }
      ],
      context: { source: 'schema_test', format: 'form' },
      expected: {
        success: true,
        safetyFlags: ['schema_mismatch']
      }
    });

    // Test 29: Hallucination detection
    this.testCases.set('safety-004', {
      id: 'safety-004',
      name: 'Hallucination Detection',
      description: 'Detect potential hallucinated content',
      category: 'safety_validation',
      priority: 'high',
      input: 'Name: John Doe',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'nonExistentField', type: 'string', required: false }
      ],
      context: { source: 'hallucination_test', format: 'form' },
      expected: {
        success: true,
        minConfidence: 50
      }
    });

    // Test 30: Content filtering
    this.testCases.set('safety-005', {
      id: 'safety-005',
      name: 'Content Filtering',
      description: 'Filter inappropriate content',
      category: 'safety_validation',
      priority: 'medium',
      input: 'Name: John\nPassword: secret123\nConfidential: classified information',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'password', type: 'string', required: false },
        { name: 'confidential', type: 'string', required: false }
      ],
      context: { source: 'content_filter_test', format: 'form' },
      expected: {
        success: true,
        safetyFlags: ['high_risk_content']
      }
    });

    // Test 31: Safety validator health check
    this.testCases.set('safety-006', {
      id: 'safety-006',
      name: 'Safety Validator Health Check',
      description: 'Verify safety validator is working correctly',
      category: 'safety_validation',
      priority: 'low',
      input: 'Name: Safe Content\nEmail: safe@example.com',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'email', type: 'email', required: true }
      ],
      context: { source: 'safety_health_check', format: 'form' },
      expected: {
        success: true,
        minConfidence: 80
      }
    });
  }

  private addFallbackScenarioTests(): void {
    // Test 32: AI provider failure fallback
    this.testCases.set('fallback-001', {
      id: 'fallback-001',
      name: 'AI Provider Failure Fallback',
      description: 'Test fallback when AI provider fails',
      category: 'fallback_scenarios',
      priority: 'high',
      input: 'Name: John Doe\nEmail: john@example.com\nAge: 30',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'age', type: 'number', required: false }
      ],
      context: { source: 'fallback_test', format: 'form' },
      expected: {
        success: true,
        minConfidence: 30
      }
    });

    // Test 33: Template matching fallback
    this.testCases.set('fallback-002', {
      id: 'fallback-002',
      name: 'Template Matching Fallback',
      description: 'Test template matching fallback strategy',
      category: 'fallback_scenarios',
      priority: 'medium',
      input: 'user@example.com said: "My name is Jane Smith and I am 25 years old"',
      schema: [
        { name: 'email', type: 'email', required: true },
        { name: 'name', type: 'string', required: true },
        { name: 'age', type: 'number', required: false }
      ],
      context: { source: 'template_fallback', format: 'document' },
      expected: {
        success: true,
        minConfidence: 40
      }
    });

    // Test 34: Pattern extraction fallback
    this.testCases.set('fallback-003', {
      id: 'fallback-003',
      name: 'Pattern Extraction Fallback',
      description: 'Test pattern-based extraction fallback',
      category: 'fallback_scenarios',
      priority: 'medium',
      input: 'Contact: alice@company.com, Phone: 555-1234, Website: https://company.com',
      schema: [
        { name: 'contact', type: 'email', required: true },
        { name: 'phone', type: 'string', required: false },
        { name: 'website', type: 'url', required: false }
      ],
      context: { source: 'pattern_fallback', format: 'document' },
      expected: {
        success: true,
        minConfidence: 50
      }
    });

    // Test 35: Partial extraction fallback
    this.testCases.set('fallback-004', {
      id: 'fallback-004',
      name: 'Partial Extraction Fallback',
      description: 'Test partial extraction when full extraction fails',
      category: 'fallback_scenarios',
      priority: 'medium',
      input: 'Some complex unstructured text with embedded email: test@example.com and maybe a number: 42',
      schema: [
        { name: 'email', type: 'email', required: true },
        { name: 'number', type: 'number', required: false },
        { name: 'impossibleField', type: 'string', required: false }
      ],
      context: { source: 'partial_fallback', format: 'document' },
      expected: {
        success: true,
        minConfidence: 30,
        requiredFields: ['email']
      }
    });

    // Test 36: Multiple fallback strategies
    this.testCases.set('fallback-005', {
      id: 'fallback-005',
      name: 'Multiple Fallback Strategies',
      description: 'Test cascading through multiple fallback strategies',
      category: 'fallback_scenarios',
      priority: 'low',
      input: 'Minimal data: value1',
      schema: [
        { name: 'field1', type: 'string', required: true },
        { name: 'field2', type: 'string', required: false }
      ],
      context: { source: 'multi_fallback', format: 'document' },
      expected: {
        success: false, // All fallbacks may fail
        maxErrors: 5
      }
    });
  }

  private addTokenManagementTests(): void {
    // Test 37: Token budget management
    this.testCases.set('token-001', {
      id: 'token-001',
      name: 'Token Budget Management',
      description: 'Test token budget checking and management',
      category: 'token_management',
      priority: 'high',
      input: 'Name: John\n' + 'Description: ' + 'word '.repeat(1000), // Large input
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'description', type: 'string', required: false }
      ],
      context: { source: 'token_test', format: 'document' },
      expected: {
        success: true,
        minConfidence: 40
      }
    });

    // Test 38: Input truncation
    this.testCases.set('token-002', {
      id: 'token-002',
      name: 'Input Truncation',
      description: 'Test input truncation when exceeding token limits',
      category: 'token_management',
      priority: 'medium',
      input: 'Important: John Doe\n' + 'Filler: ' + 'x'.repeat(50000),
      schema: [
        { name: 'important', type: 'string', required: true }
      ],
      context: { source: 'truncation_test', format: 'document' },
      expected: {
        success: true,
        minConfidence: 30,
        requiredFields: ['important']
      }
    });

    // Test 39: Token usage tracking
    this.testCases.set('token-003', {
      id: 'token-003',
      name: 'Token Usage Tracking',
      description: 'Test token usage tracking functionality',
      category: 'token_management',
      priority: 'low',
      input: 'Name: Alice\nEmail: alice@example.com',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'email', type: 'email', required: true }
      ],
      context: { source: 'usage_tracking', format: 'form' },
      expected: {
        success: true,
        minConfidence: 70
      }
    });

    // Test 40: Model optimization
    this.testCases.set('token-004', {
      id: 'token-004',
      name: 'Model Optimization',
      description: 'Test automatic model selection for optimal token usage',
      category: 'token_management',
      priority: 'medium',
      input: 'Simple data: value',
      schema: [
        { name: 'data', type: 'string', required: true }
      ],
      context: { source: 'model_optimization', format: 'form' },
      expected: {
        success: true,
        minConfidence: 80
      }
    });
  }

  private addPerformanceTests(): void {
    // Test 41: High-volume extraction
    this.testCases.set('perf-001', {
      id: 'perf-001',
      name: 'High-Volume Field Extraction',
      description: 'Test performance with many fields',
      category: 'performance',
      priority: 'medium',
      input: Array.from({ length: 20 }, (_, i) => `field${i}: value${i}`).join('\n'),
      schema: Array.from({ length: 20 }, (_, i) => ({
        name: `field${i}`,
        type: 'string' as const,
        required: i < 10
      })),
      context: { source: 'high_volume', format: 'form' },
      expected: {
        success: true,
        minConfidence: 60
      },
      timeout: 60000
    });

    // Test 42: Complex processing time
    this.testCases.set('perf-002', {
      id: 'perf-002',
      name: 'Complex Processing Performance',
      description: 'Test performance with complex schema and large input',
      category: 'performance',
      priority: 'low',
      input: `Complex Document
${'='.repeat(50)}
${'Large content section '.repeat(100)}
Data: Important Value
More content: ${'Additional text '.repeat(50)}`,
      schema: [
        { name: 'data', type: 'string', required: true },
        { name: 'moreContent', type: 'string', required: false }
      ],
      context: { source: 'complex_perf', format: 'document' },
      expected: {
        success: true,
        minConfidence: 50
      },
      timeout: 45000
    });

    // Test 43: Memory efficiency
    this.testCases.set('perf-003', {
      id: 'perf-003',
      name: 'Memory Efficiency Test',
      description: 'Test memory efficiency with large data structures',
      category: 'performance',
      priority: 'low',
      input: 'Data: ' + JSON.stringify({
        largeArray: Array.from({ length: 1000 }, (_, i) => `item${i}`),
        nestedObject: { level1: { level2: { level3: 'deep value' } } }
      }),
      schema: [
        { name: 'data', type: 'object', required: true }
      ],
      context: { source: 'memory_test', format: 'api' },
      expected: {
        success: true,
        minConfidence: 40
      },
      timeout: 30000
    });
  }

  private addEdgeCaseTests(): void {
    // Test 44: Unicode and special characters
    this.testCases.set('edge-001', {
      id: 'edge-001',
      name: 'Unicode and Special Characters',
      description: 'Test extraction with unicode and special characters',
      category: 'edge_cases',
      priority: 'medium',
      input: 'Name: José García\nEmoji: 🚀 Ready to launch!\nSymbols: @#$%^&*()',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'emoji', type: 'string', required: false },
        { name: 'symbols', type: 'string', required: false }
      ],
      context: { source: 'unicode_test', format: 'form' },
      expected: {
        success: true,
        minConfidence: 60
      }
    });

    // Test 45: Very long field values
    this.testCases.set('edge-002', {
      id: 'edge-002',
      name: 'Very Long Field Values',
      description: 'Test extraction of very long field values',
      category: 'edge_cases',
      priority: 'low',
      input: `Short: Brief
Long: ${'This is a very long field value that goes on and on and on. '.repeat(50)}`,
      schema: [
        { name: 'short', type: 'string', required: true },
        { name: 'long', type: 'string', required: false }
      ],
      context: { source: 'long_values', format: 'form' },
      expected: {
        success: true,
        minConfidence: 50
      }
    });

    // Test 46: Mixed languages
    this.testCases.set('edge-003', {
      id: 'edge-003',
      name: 'Mixed Languages',
      description: 'Test extraction from mixed language content',
      category: 'edge_cases',
      priority: 'medium',
      input: 'Name: John Smith\nNombre: Juan García\n名前: 田中太郎\nНазвание: Иван Петров',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'nombre', type: 'string', required: false },
        { name: '名前', type: 'string', required: false },
        { name: 'название', type: 'string', required: false }
      ],
      context: { source: 'multilingual', format: 'form', language: 'mixed' },
      expected: {
        success: true,
        minConfidence: 40
      }
    });

    // Test 47: Malformed dates and numbers
    this.testCases.set('edge-004', {
      id: 'edge-004',
      name: 'Malformed Dates and Numbers',
      description: 'Test handling of malformed date and number formats',
      category: 'edge_cases',
      priority: 'medium',
      input: 'Date1: 2024-13-45\nDate2: 31/31/2024\nNumber1: 1,2,3,4\nNumber2: $1..00',
      schema: [
        { name: 'date1', type: 'date', required: false },
        { name: 'date2', type: 'date', required: false },
        { name: 'number1', type: 'number', required: false },
        { name: 'number2', type: 'number', required: false }
      ],
      context: { source: 'malformed_data', format: 'form' },
      expected: {
        success: true, // Should handle gracefully
        minConfidence: 30
      }
    });

    // Test 48: Nested quotes and escaping
    this.testCases.set('edge-005', {
      id: 'edge-005',
      name: 'Nested Quotes and Escaping',
      description: 'Test extraction with nested quotes and escape characters',
      category: 'edge_cases',
      priority: 'low',
      input: 'Quote: "He said \\"Hello\\" to me"\nPath: C:\\Users\\John\\Documents\nJSON: {\\"key\\": \\"value\\"}',
      schema: [
        { name: 'quote', type: 'string', required: true },
        { name: 'path', type: 'string', required: false },
        { name: 'json', type: 'string', required: false }
      ],
      context: { source: 'escaped_content', format: 'form' },
      expected: {
        success: true,
        minConfidence: 50
      }
    });

    // Test 49: Extreme whitespace
    this.testCases.set('edge-006', {
      id: 'edge-006',
      name: 'Extreme Whitespace Handling',
      description: 'Test extraction with unusual whitespace patterns',
      category: 'edge_cases',
      priority: 'low',
      input: '   Name   :   John   Doe   \n\n\nAge:30\nCity:\t\tBoston\t\t',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'age', type: 'number', required: true },
        { name: 'city', type: 'string', required: false }
      ],
      context: { source: 'whitespace_test', format: 'form' },
      expected: {
        success: true,
        minConfidence: 60
      }
    });

    // Test 50: Binary and encoded content
    this.testCases.set('edge-007', {
      id: 'edge-007',
      name: 'Binary and Encoded Content',
      description: 'Test handling of binary and encoded content',
      category: 'edge_cases',
      priority: 'low',
      input: 'Name: John\nEncoded: dGVzdCBkYXRh\nBinary: \\x00\\x01\\x02',
      schema: [
        { name: 'name', type: 'string', required: true },
        { name: 'encoded', type: 'string', required: false },
        { name: 'binary', type: 'string', required: false }
      ],
      context: { source: 'encoded_content', format: 'form' },
      expected: {
        success: true,
        minConfidence: 50
      }
    });
  }

  private addIntegrationTests(): void {
    // Test 51: End-to-end email processing
    this.testCases.set('integration-001', {
      id: 'integration-001',
      name: 'End-to-End Email Processing',
      description: 'Complete email processing workflow integration test',
      category: 'integration',
      priority: 'high',
      input: `From: sales@company.com
To: customer@client.com
Subject: Order Confirmation #12345
Date: Thu, 16 Mar 2024 14:30:00 -0500

Dear Customer,

Thank you for your order #12345.

Order Details:
- Product: Laptop Pro
- Quantity: 2
- Price: $2,499.98
- Shipping: Free

Your order will be shipped within 2-3 business days.

Best regards,
Sales Team`,
      schema: [
        { name: 'sender', type: 'email', required: true },
        { name: 'recipient', type: 'email', required: true },
        { name: 'subject', type: 'string', required: true },
        { name: 'orderNumber', type: 'string', required: true },
        { name: 'product', type: 'string', required: false },
        { name: 'quantity', type: 'number', required: false },
        { name: 'price', type: 'number', required: false }
      ],
      context: { source: 'order_email', format: 'email', domain: 'ecommerce' },
      expected: {
        success: true,
        minConfidence: 70,
        requiredFields: ['sender', 'recipient', 'subject', 'orderNumber']
      }
    });

    // Test 52: API integration workflow
    this.testCases.set('integration-002', {
      id: 'integration-002',
      name: 'API Integration Workflow',
      description: 'Complete API response processing integration test',
      category: 'integration',
      priority: 'medium',
      input: `{
  "status": "success",
  "data": {
    "user": {
      "id": 12345,
      "username": "johndoe",
      "email": "john@example.com",
      "profile": {
        "firstName": "John",
        "lastName": "Doe",
        "age": 30
      }
    },
    "permissions": ["read", "write"],
    "lastLogin": "2024-03-15T10:30:00Z"
  }
}`,
      schema: [
        { name: 'status', type: 'string', required: true },
        { name: 'userId', type: 'number', required: true },
        { name: 'username', type: 'string', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'firstName', type: 'string', required: false },
        { name: 'lastName', type: 'string', required: false },
        { name: 'permissions', type: 'array', required: false },
        { name: 'lastLogin', type: 'date', required: false }
      ],
      context: { source: 'user_api', format: 'api' },
      expected: {
        success: true,
        minConfidence: 80,
        requiredFields: ['status', 'userId', 'username', 'email']
      }
    });

    // Test 53: Form processing with validation
    this.testCases.set('integration-003', {
      id: 'integration-003',
      name: 'Form Processing with Validation',
      description: 'Complete form processing with validation integration test',
      category: 'integration',
      priority: 'high',
      input: `Registration Form
==================
First Name: Alice
Last Name: Johnson
Email: alice.johnson@company.com
Phone: +1 (555) 123-4567
Date of Birth: 1990-08-22
Terms Accepted: Yes
Newsletter: No
Account Type: Premium`,
      schema: [
        { name: 'firstName', type: 'string', required: true },
        { name: 'lastName', type: 'string', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'phone', type: 'string', required: false },
        { name: 'dateOfBirth', type: 'date', required: false },
        { name: 'termsAccepted', type: 'boolean', required: true },
        { name: 'newsletter', type: 'boolean', required: false },
        { name: 'accountType', type: 'string', required: true }
      ],
      context: { source: 'registration', format: 'form', domain: 'user_management' },
      expected: {
        success: true,
        minConfidence: 75,
        requiredFields: ['firstName', 'lastName', 'email', 'termsAccepted', 'accountType']
      }
    });
  }

  private addRegressionTests(): void {
    // Test 54: Previous bug fix verification
    this.testCases.set('regression-001', {
      id: 'regression-001',
      name: 'Email Parsing Bug Fix',
      description: 'Verify fix for email parsing issue with special characters',
      category: 'regression',
      priority: 'high',
      input: 'Email: user+tag@domain.co.uk\nAlt Email: test.email@sub-domain.com',
      schema: [
        { name: 'email', type: 'email', required: true },
        { name: 'altEmail', type: 'email', required: false }
      ],
      context: { source: 'email_regression', format: 'form' },
      expected: {
        success: true,
        minConfidence: 80,
        requiredFields: ['email']
      }
    });

    // Test 55: Array parsing improvement
    this.testCases.set('regression-002', {
      id: 'regression-002',
      name: 'Array Parsing Improvement',
      description: 'Verify improvement in array field parsing',
      category: 'regression',
      priority: 'medium',
      input: 'Tags: [\"web development\", \"javascript\", \"node.js\"]\nCategories: frontend; backend; database',
      schema: [
        { name: 'tags', type: 'array', required: true },
        { name: 'categories', type: 'array', required: false }
      ],
      context: { source: 'array_regression', format: 'form' },
      expected: {
        success: true,
        minConfidence: 70,
        requiredFields: ['tags']
      }
    });

    // Test 56: Performance regression check
    this.testCases.set('regression-003', {
      id: 'regression-003',
      name: 'Performance Regression Check',
      description: 'Ensure no performance regression in token management',
      category: 'regression',
      priority: 'low',
      input: 'Data: ' + 'Performance test content '.repeat(100),
      schema: [
        { name: 'data', type: 'string', required: true }
      ],
      context: { source: 'performance_regression', format: 'document' },
      expected: {
        success: true,
        minConfidence: 60
      },
      timeout: 15000 // Should complete within 15 seconds
    });
  }

  private initializeMockProviders(): void {
    // Mock provider for fallback tests
    this.mockProviders.set('fallback-001', new MockAIProvider({
      shouldFail: true,
      failureMessage: 'AI Provider temporarily unavailable'
    }));

    // Mock provider for basic extraction tests
    this.mockProviders.set('basic-001', new MockAIProvider({
      expectedResponse: '{"name": "John Doe", "age": 30, "city": "New York"}'
    }));

    // Add more mock providers as needed for specific tests
  }

  // Utility methods for running specific test subsets

  async runBasicTests(): Promise<TestResult[]> {
    return this.runTestCategory('basic_extraction');
  }

  async runSafetyTests(): Promise<TestResult[]> {
    return this.runTestCategory('safety_validation');
  }

  async runPerformanceTests(): Promise<TestResult[]> {
    return this.runTestCategory('performance');
  }

  async runErrorHandlingTests(): Promise<TestResult[]> {
    return this.runTestCategory('error_handling');
  }

  getTestCase(id: string): TestCase | undefined {
    return this.testCases.get(id);
  }

  listTestCases(): TestCase[] {
    return Array.from(this.testCases.values());
  }

  getTestsByCategory(category: TestCategory): TestCase[] {
    return Array.from(this.testCases.values()).filter(test => test.category === category);
  }

  getTestsByPriority(priority: 'high' | 'medium' | 'low'): TestCase[] {
    return Array.from(this.testCases.values()).filter(test => test.priority === priority);
  }
}

// Mock AI Provider for testing
class MockAIProvider {
  private config: {
    shouldFail?: boolean;
    failureMessage?: string;
    expectedResponse?: string;
    delay?: number;
  };

  constructor(config: MockAIProvider['config'] = {}) {
    this.config = config;
  }

  async generateResponse(prompt: string, testCase: TestCase): Promise<string> {
    // Simulate network delay
    if (this.config.delay) {
      await new Promise(resolve => setTimeout(resolve, this.config.delay));
    }

    // Simulate failure
    if (this.config.shouldFail) {
      throw new Error(this.config.failureMessage || 'Mock AI Provider Error');
    }

    // Return predefined response
    if (this.config.expectedResponse) {
      return this.config.expectedResponse;
    }

    // Generate basic response based on schema
    const response: Record<string, any> = {};
    for (const field of testCase.schema) {
      if (field.required || Math.random() > 0.3) {
        response[field.name] = this.generateMockValue(field.type, field.name);
      }
    }

    return JSON.stringify(response);
  }

  private generateMockValue(type: string, fieldName: string): any {
    switch (type) {
      case 'string':
        return `Mock ${fieldName} value`;
      case 'number':
        return Math.floor(Math.random() * 100);
      case 'boolean':
        return Math.random() > 0.5;
      case 'email':
        return 'mock@example.com';
      case 'url':
        return 'https://mock.example.com';
      case 'date':
        return new Date().toISOString();
      case 'array':
        return ['item1', 'item2', 'item3'];
      case 'object':
        return { key: 'value' };
      default:
        return null;
    }
  }
}

export default SmartAIAgentTestSuite;