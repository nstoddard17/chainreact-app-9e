/**
 * Logger Utility Tests
 *
 * Run with: npm test lib/utils/logger.test.ts
 */

import { logger, Logger, LogLevel } from './logger'

describe('Logger Utility', () => {
  let testLogger: Logger
  let consoleLogSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    testLogger = new Logger()
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('Log Levels', () => {
    test('ERROR level only shows ERROR logs', () => {
      testLogger.setLevel(LogLevel.ERROR)

      testLogger.error('Error message')
      testLogger.warn('Warn message')
      testLogger.info('Info message')
      testLogger.debug('Debug message')
      testLogger.trace('Trace message')

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledTimes(0)
      expect(consoleLogSpy).toHaveBeenCalledTimes(0)
    })

    test('WARN level shows ERROR and WARN logs', () => {
      testLogger.setLevel(LogLevel.WARN)

      testLogger.error('Error message')
      testLogger.warn('Warn message')
      testLogger.info('Info message')
      testLogger.debug('Debug message')
      testLogger.trace('Trace message')

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleLogSpy).toHaveBeenCalledTimes(0)
    })

    test('INFO level shows ERROR, WARN, and INFO logs', () => {
      testLogger.setLevel(LogLevel.INFO)

      testLogger.error('Error message')
      testLogger.warn('Warn message')
      testLogger.info('Info message')
      testLogger.debug('Debug message')
      testLogger.trace('Trace message')

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    })

    test('DEBUG level shows ERROR, WARN, INFO, and DEBUG logs', () => {
      testLogger.setLevel(LogLevel.DEBUG)

      testLogger.error('Error message')
      testLogger.warn('Warn message')
      testLogger.info('Info message')
      testLogger.debug('Debug message')
      testLogger.trace('Trace message')

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleLogSpy).toHaveBeenCalledTimes(2) // INFO + DEBUG
    })

    test('TRACE level shows all logs', () => {
      testLogger.setLevel(LogLevel.TRACE)

      testLogger.error('Error message')
      testLogger.warn('Warn message')
      testLogger.info('Info message')
      testLogger.debug('Debug message')
      testLogger.trace('Trace message')

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleLogSpy).toHaveBeenCalledTimes(3) // INFO + DEBUG + TRACE
    })
  })

  describe('Message Formatting', () => {
    beforeEach(() => {
      testLogger.setLevel(LogLevel.TRACE)
    })

    test('Formats message with timestamp and level', () => {
      testLogger.info('Test message')

      expect(consoleLogSpy).toHaveBeenCalled()
      const logCall = consoleLogSpy.mock.calls[0][0]
      expect(logCall).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] Test message/)
    })

    test('Includes metadata as JSON', () => {
      testLogger.info('Test message', { userId: '123', action: 'login' })

      expect(consoleLogSpy).toHaveBeenCalled()
      const logCall = consoleLogSpy.mock.calls[0][0]
      expect(logCall).toContain('{"userId":"123","action":"login"}')
    })

    test('Handles primitive metadata', () => {
      testLogger.info('Test message', 'simple string')

      expect(consoleLogSpy).toHaveBeenCalled()
      const logCall = consoleLogSpy.mock.calls[0][0]
      expect(logCall).toContain('simple string')
    })

    test('Handles circular references gracefully', () => {
      const circular: any = { a: 1 }
      circular.self = circular

      testLogger.debug('Circular object', circular)

      expect(consoleLogSpy).toHaveBeenCalled()
      const logCall = consoleLogSpy.mock.calls[0][0]
      expect(logCall).toContain('[Object with circular reference]')
    })
  })

  describe('Conditional Logging', () => {
    test('ifDebug executes callback only when DEBUG enabled', () => {
      testLogger.setLevel(LogLevel.INFO)
      let executed = false

      testLogger.ifDebug(() => {
        executed = true
      })

      expect(executed).toBe(false)

      testLogger.setLevel(LogLevel.DEBUG)
      testLogger.ifDebug(() => {
        executed = true
      })

      expect(executed).toBe(true)
    })

    test('ifTrace executes callback only when TRACE enabled', () => {
      testLogger.setLevel(LogLevel.DEBUG)
      let executed = false

      testLogger.ifTrace(() => {
        executed = true
      })

      expect(executed).toBe(false)

      testLogger.setLevel(LogLevel.TRACE)
      testLogger.ifTrace(() => {
        executed = true
      })

      expect(executed).toBe(true)
    })
  })

  describe('Performance', () => {
    test('Skips expensive operations when level disabled', () => {
      testLogger.setLevel(LogLevel.INFO)

      const expensiveOperation = jest.fn(() => {
        // Simulate expensive JSON.stringify
        return JSON.stringify(Array(1000).fill({ data: 'test' }))
      })

      // This should NOT call expensiveOperation
      testLogger.ifDebug(() => {
        testLogger.debug('Expensive log', expensiveOperation())
      })

      expect(expensiveOperation).not.toHaveBeenCalled()
    })
  })
})
