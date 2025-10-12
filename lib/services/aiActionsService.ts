import { ExecutionContext } from "./workflowExecutionService"

export class AIActionsService {
  async executeAIAction(node: any, context: ExecutionContext): Promise<any> {
    const nodeType = node.data.type
    const config = context.dataFlowManager.resolveObject(node.data?.config || {})

    console.log(`🤖 Executing AI action: ${nodeType}`)

    switch (nodeType) {
      case "ai_action_summarize":
        return await this.executeSummarize(config, context)
      case "ai_action_extract":
        return await this.executeExtract(config, context)
      case "ai_action_sentiment":
        return await this.executeSentiment(config, context)
      case "ai_action_translate":
        return await this.executeTranslate(config, context)
      case "ai_action_generate":
        return await this.executeGenerate(config, context)
      case "ai_action_classify":
        return await this.executeClassify(config, context)
      default:
        throw new Error(`Unknown AI action: ${nodeType}`)
    }
  }

  async executeAIAgent(node: any, context: ExecutionContext): Promise<any> {
    console.log("🤖 Executing AI Agent")
    
    // Resolve variable references in config before executing
    const aiResolvedConfig = context.dataFlowManager.resolveObject(node.data?.config || {})

    console.log("🤖 AI Agent executing with resolved config keys:", Object.keys(aiResolvedConfig || {}))
    
    // Call AI agent directly
    const { executeAIAgent } = await import('@/lib/workflows/aiAgent')
    return await executeAIAgent({
      userId: context.userId,
      config: aiResolvedConfig,
      input: {
        ...context.data,
        variables: context.variables
      }
    })
  }

  private normalizeInputText(config: any, fallback: string = ""): string {
    if (typeof config?.inputText === "string") return config.inputText
    if (typeof config?.text === "string") return config.text
    return fallback
  }

  private normalizeNumber(value: any, defaultValue: number): number {
    if (value === undefined || value === null) return defaultValue
    const parsed = Number(value)
    return Number.isNaN(parsed) ? defaultValue : parsed
  }

  private normalizeArray(value: any): string[] {
    if (Array.isArray(value)) return value
    if (typeof value === "string") {
      return value
        .split(/\r?\n|,/)
        .map(entry => entry.trim())
        .filter(Boolean)
    }
    return []
  }

  private normalizeInputData(value: any): Record<string, any> {
    if (!value) return {}
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === "object" ? parsed : {}
      } catch {
        return {}
      }
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return value
    }
    return {}
  }

  private async executeSummarize(config: any, context: ExecutionContext) {
    const text = this.normalizeInputText(config, context.data?.text || "")
    const maxLength = this.normalizeNumber(config.maxLength, 300)
    const style = config.style || ""
    const focus = config.focus || ""

    if (context.testMode) {
      return {
        type: "ai_action_summarize",
        summary: `Test summary of: ${text.substring(0, Math.min(maxLength, 50))}...`,
        originalLength: text.length,
        summaryLength: Math.min(maxLength, 50),
        style,
        focus
      }
    }

    // TODO: Replace with real AI summarization call
    const summary = text.substring(0, maxLength)
    return {
      type: "ai_action_summarize",
      summary,
      originalLength: text.length,
      summaryLength: summary.length,
      style,
      focus
    }
  }

  private async executeExtract(config: any, context: ExecutionContext) {
    const text = this.normalizeInputText(config, context.data?.text || "")
    const extractionType = config.extractionType || "entities"
    const instructions = config.instructions || ""
    const returnFormat = config.returnFormat || "auto"

    if (context.testMode) {
      return {
        type: "ai_action_extract",
        extractionType,
        extracted: ["test entity 1", "test entity 2"],
        text,
        instructions,
        returnFormat
      }
    }

    // TODO: Replace with real AI extraction
    return {
      type: "ai_action_extract",
      extractionType,
      extracted: [],
      text,
      instructions,
      returnFormat
    }
  }

  private async executeSentiment(config: any, context: ExecutionContext) {
    const text = this.normalizeInputText(config, context.data?.text || "")
    const labels = this.normalizeArray(config.labels)
    const includeConfidence = config.confidence !== false

    if (context.testMode) {
      return {
        type: "ai_action_sentiment",
        sentiment: "positive",
        confidence: includeConfidence ? 0.85 : undefined,
        text,
        labels
      }
    }

    // TODO: Replace with real sentiment analysis
    return {
      type: "ai_action_sentiment",
      sentiment: "neutral",
      confidence: includeConfidence ? 0.5 : undefined,
      text,
      labels
    }
  }

  private async executeTranslate(config: any, context: ExecutionContext) {
    const text = this.normalizeInputText(config, context.data?.text || "")
    const targetLanguage = config.targetLanguage || "en"
    const sourceLanguage = config.sourceLanguage || "auto"

    if (context.testMode) {
      return {
        type: "ai_action_translate",
        originalText: text,
        translatedText: `[Translated to ${targetLanguage}] ${text}`,
        sourceLanguage,
        targetLanguage
      }
    }

    // TODO: Replace with real translation
    return {
      type: "ai_action_translate",
      originalText: text,
      translatedText: text, // No translation in fallback
      sourceLanguage,
      targetLanguage
    }
  }

  private async executeGenerate(config: any, context: ExecutionContext) {
    const prompt = config.prompt || ""
    const contentType = config.contentType || "response"
    const tone = config.tone || "neutral"
    const length = config.length || "medium"
    const temperature = this.normalizeNumber(config.temperature, 0.7)
    const maxTokens = this.normalizeNumber(config.maxTokens, 300)
    const inputData = this.normalizeInputData(config.inputData)
    const timestamp = new Date().toISOString()

    if (context.testMode) {
      return {
        type: "ai_action_generate",
        prompt,
        content: `Test generated content based on: ${prompt.substring(0, 40)}...`,
        contentType,
        tone,
        length,
        temperature,
        maxTokens,
        inputData,
        timestamp
      }
    }

    // TODO: Replace with real text generation
    return {
      type: "ai_action_generate",
      prompt,
      content: "Generated content would appear here",
      contentType,
      tone,
      length,
      temperature,
      maxTokens,
      inputData,
      timestamp
    }
  }

  private async executeClassify(config: any, context: ExecutionContext) {
    const text = this.normalizeInputText(config, context.data?.text || "")
    const categories = this.normalizeArray(config.categories)
    const includeConfidence = config.confidence !== false
    const normalizedCategories = categories.length > 0 ? categories : ["positive", "negative", "neutral"]

    if (context.testMode) {
      return {
        type: "ai_action_classify",
        text,
        classification: normalizedCategories[0],
        confidence: includeConfidence ? 0.85 : undefined,
        categories: normalizedCategories
      }
    }

    // TODO: Replace with real classification
    return {
      type: "ai_action_classify",
      text,
      classification: normalizedCategories[0] || "unknown",
      confidence: includeConfidence ? 0.5 : undefined,
      categories: normalizedCategories
    }
  }
}
