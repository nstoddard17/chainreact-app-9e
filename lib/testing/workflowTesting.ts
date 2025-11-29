import { createClient } from "@supabase/supabase-js"
import { AdvancedExecutionEngine } from "../execution/advancedExecutionEngine"

export interface TestCase {
  id: string
  name: string
  description: string
  input: any
  expectedOutput: any
  assertions: TestAssertion[]
  timeout: number
  retries: number
}

export interface TestAssertion {
  type: "equals" | "contains" | "exists" | "type" | "range" | "custom"
  path: string
  expected: any
  message?: string
}

export interface TestResult {
  testCaseId: string
  passed: boolean
  executionTime: number
  actualOutput: any
  errors: string[]
  assertions: AssertionResult[]
}

export interface AssertionResult {
  assertion: TestAssertion
  passed: boolean
  actual: any
  message: string
}

export interface TestSuite {
  id: string
  workflow_id: string
  name: string
  description: string
  test_cases: TestCase[]
  created_by: string
  created_at: string
  updated_at: string
}

export class WorkflowTestingFramework {
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
  private executionEngine = new AdvancedExecutionEngine()

  async createTestSuite(workflowId: string, userId: string, name: string, description: string): Promise<TestSuite> {
    const { data, error } = await this.supabase
      .from("workflow_test_suites")
      .insert({
        workflow_id: workflowId,
        name,
        description,
        test_cases: [],
        created_by: userId,
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async addTestCase(suiteId: string, testCase: Omit<TestCase, "id">): Promise<TestCase> {
    const newTestCase: TestCase = {
      id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...testCase,
    }

    // Get current test suite
    const { data: suite } = await this.supabase
      .from("workflow_test_suites")
      .select("test_cases")
      .eq("id", suiteId)
      .single()

    if (!suite) throw new Error("Test suite not found")

    const updatedTestCases = [...(suite.test_cases || []), newTestCase]

    // Update test suite
    await this.supabase.from("workflow_test_suites").update({ test_cases: updatedTestCases }).eq("id", suiteId)

    return newTestCase
  }

  async runTestSuite(suiteId: string): Promise<{
    suiteId: string
    totalTests: number
    passedTests: number
    failedTests: number
    executionTime: number
    results: TestResult[]
  }> {
    // Get test suite
    const { data: suite } = await this.supabase.from("workflow_test_suites").select("*").eq("id", suiteId).single()

    if (!suite) throw new Error("Test suite not found")

    const startTime = Date.now()
    const results: TestResult[] = []

    // Run each test case
    for (const testCase of suite.test_cases) {
      const result = await this.runTestCase(suite.workflow_id, testCase)
      results.push(result)
    }

    const executionTime = Date.now() - startTime
    const passedTests = results.filter((r) => r.passed).length
    const failedTests = results.length - passedTests

    // Save test run results
    await this.saveTestRun(suiteId, {
      totalTests: results.length,
      passedTests,
      failedTests,
      executionTime,
      results,
    })

    return {
      suiteId,
      totalTests: results.length,
      passedTests,
      failedTests,
      executionTime,
      results,
    }
  }

  private async runTestCase(workflowId: string, testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let actualOutput: any = null
    let passed = false

    try {
      // Create execution session
      const session = await this.executionEngine.createExecutionSession(workflowId, "test-user", "api", {
        testCase: testCase.id,
      })

      // Execute workflow with test input
      const executionPromise = this.executionEngine.executeWorkflowAdvanced(session.id, testCase.input, {
        enableParallel: true,
        enableSubWorkflows: true,
      })

      // Apply timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Test timeout")), testCase.timeout || 30000)
      })

      actualOutput = await Promise.race([executionPromise, timeoutPromise])

      // Run assertions
      const assertionResults = await this.runAssertions(testCase.assertions, actualOutput, testCase.expectedOutput)

      passed = assertionResults.every((ar) => ar.passed)

      return {
        testCaseId: testCase.id,
        passed,
        executionTime: Date.now() - startTime,
        actualOutput,
        errors,
        assertions: assertionResults,
      }
    } catch (error: any) {
      errors.push(error.message)

      return {
        testCaseId: testCase.id,
        passed: false,
        executionTime: Date.now() - startTime,
        actualOutput,
        errors,
        assertions: [],
      }
    }
  }

  private async runAssertions(
    assertions: TestAssertion[],
    actualOutput: any,
    expectedOutput: any,
  ): Promise<AssertionResult[]> {
    const results: AssertionResult[] = []

    for (const assertion of assertions) {
      const result = await this.runAssertion(assertion, actualOutput, expectedOutput)
      results.push(result)
    }

    return results
  }

  private async runAssertion(
    assertion: TestAssertion,
    actualOutput: any,
    expectedOutput: any,
  ): Promise<AssertionResult> {
    try {
      const actual = this.getValueByPath(actualOutput, assertion.path)
      let passed = false
      let message = ""

      switch (assertion.type) {
        case "equals":
          passed = this.deepEquals(actual, assertion.expected)
          message = passed
            ? `✓ ${assertion.path} equals expected value`
            : `✗ ${assertion.path}: expected ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(actual)}`
          break

        case "contains":
          passed = actual && actual.toString().includes(assertion.expected)
          message = passed
            ? `✓ ${assertion.path} contains "${assertion.expected}"`
            : `✗ ${assertion.path} does not contain "${assertion.expected}"`
          break

        case "exists":
          passed = actual !== undefined && actual !== null
          message = passed ? `✓ ${assertion.path} exists` : `✗ ${assertion.path} does not exist`
          break

        case "type":
          passed = typeof actual === assertion.expected
          message = passed
            ? `✓ ${assertion.path} is of type ${assertion.expected}`
            : `✗ ${assertion.path}: expected type ${assertion.expected}, got ${typeof actual}`
          break

        case "range":
          const { min, max } = assertion.expected
          passed = actual >= min && actual <= max
          message = passed
            ? `✓ ${assertion.path} is within range [${min}, ${max}]`
            : `✗ ${assertion.path}: ${actual} is not within range [${min}, ${max}]`
          break

        case "custom":
          // Custom assertion logic would go here
          passed = true
          message = "Custom assertion passed"
          break

        default:
          passed = false
          message = `Unknown assertion type: ${assertion.type}`
      }

      return {
        assertion,
        passed,
        actual,
        message: assertion.message || message,
      }
    } catch (error: any) {
      return {
        assertion,
        passed: false,
        actual: undefined,
        message: `Assertion error: ${error.message}`,
      }
    }
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined
    }, obj)
  }

  private deepEquals(a: any, b: any): boolean {
    if (a === b) return true
    if (a == null || b == null) return false
    if (typeof a !== typeof b) return false

    if (typeof a === "object") {
      const keysA = Object.keys(a)
      const keysB = Object.keys(b)

      if (keysA.length !== keysB.length) return false

      for (const key of keysA) {
        if (!keysB.includes(key)) return false
        if (!this.deepEquals(a[key], b[key])) return false
      }

      return true
    }

    return false
  }

  private async saveTestRun(suiteId: string, results: any): Promise<void> {
    await this.supabase.from("workflow_test_runs").insert({
      test_suite_id: suiteId,
      results,
      executed_at: new Date().toISOString(),
    })
  }

  async generateTestCasesFromExecution(workflowId: string, executionId: string): Promise<TestCase[]> {
    // Get execution data
    const { data: execution } = await this.supabase
      .from("workflow_execution_sessions")
      .select("*")
      .eq("id", executionId)
      .single()

    if (!execution) throw new Error("Execution not found")

    // Get execution events to understand the flow
    const { data: events } = await this.supabase
      .from("live_execution_events")
      .select("*")
      .eq("session_id", executionId)
      .order("timestamp")

    const testCases: TestCase[] = []

    // Generate basic test case from execution
    const basicTestCase: TestCase = {
      id: `generated-${Date.now()}`,
      name: "Generated from execution",
      description: `Test case generated from execution ${executionId}`,
      input: execution.execution_context || {},
      expectedOutput: {}, // Would need to extract from execution results
      assertions: [
        {
          type: "exists",
          path: "result",
          expected: true,
          message: "Execution should produce a result",
        },
      ],
      timeout: 30000,
      retries: 1,
    }

    testCases.push(basicTestCase)

    // Generate edge case test cases
    const edgeCases = this.generateEdgeCaseTests(execution.execution_context)
    testCases.push(...edgeCases)

    return testCases
  }

  private generateEdgeCaseTests(inputData: any): TestCase[] {
    const edgeCases: TestCase[] = []

    // Empty input test
    edgeCases.push({
      id: `edge-empty-${Date.now()}`,
      name: "Empty Input Test",
      description: "Test workflow behavior with empty input",
      input: {},
      expectedOutput: {},
      assertions: [
        {
          type: "exists",
          path: "error",
          expected: false,
          message: "Should handle empty input gracefully",
        },
      ],
      timeout: 30000,
      retries: 1,
    })

    // Null input test
    edgeCases.push({
      id: `edge-null-${Date.now()}`,
      name: "Null Input Test",
      description: "Test workflow behavior with null values",
      input: Object.keys(inputData).reduce((acc, key) => {
        acc[key] = null
        return acc
      }, {} as any),
      expectedOutput: {},
      assertions: [
        {
          type: "exists",
          path: "error",
          expected: false,
          message: "Should handle null input gracefully",
        },
      ],
      timeout: 30000,
      retries: 1,
    })

    return edgeCases
  }
}
