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

  private async executeSummarize(config: any, context: ExecutionContext) {
    const text = config.text || context.data?.text || ""
    const maxLength = config.maxLength || 100

    if (context.testMode) {
      return {
        type: "ai_action_summarize",
        summary: `Test summary of: ${text.substring(0, 50)}...`,
        originalLength: text.length,
        summaryLength: Math.min(maxLength, 50)
      }
    }

    // TODO: Implement actual AI summarization
    return {
      type: "ai_action_summarize",
      summary: `Summary: ${text.substring(0, maxLength)}...`,
      originalLength: text.length,
      summaryLength: maxLength
    }
  }

  private async executeExtract(config: any, context: ExecutionContext) {
    const text = config.text || context.data?.text || ""
    const extractionType = config.extractionType || "entities"

    if (context.testMode) {
      return {
        type: "ai_action_extract",
        extractionType,
        extracted: ["test entity 1", "test entity 2"],
        text
      }
    }

    // TODO: Implement actual AI extraction
    return {
      type: "ai_action_extract",
      extractionType,
      extracted: [],
      text
    }
  }

  private async executeSentiment(config: any, context: ExecutionContext) {
    const text = config.text || context.data?.text || ""

    if (context.testMode) {
      return {
        type: "ai_action_sentiment",
        sentiment: "positive",
        confidence: 0.85,
        text
      }
    }

    // TODO: Implement actual sentiment analysis
    return {
      type: "ai_action_sentiment",
      sentiment: "neutral",
      confidence: 0.5,
      text
    }
  }

  private async executeTranslate(config: any, context: ExecutionContext) {
    const text = config.text || context.data?.text || ""
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

    // TODO: Implement actual translation
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
    const maxTokens = config.maxTokens || 100

    if (context.testMode) {
      return {
        type: "ai_action_generate",
        prompt,
        generated: `Test generated content based on: ${prompt.substring(0, 30)}...`,
        maxTokens
      }
    }

    // TODO: Implement actual text generation
    return {
      type: "ai_action_generate",
      prompt,
      generated: "Generated content would appear here",
      maxTokens
    }
  }

  private async executeClassify(config: any, context: ExecutionContext) {
    const text = config.text || context.data?.text || ""
    const categories = config.categories || ["positive", "negative", "neutral"]

    if (context.testMode) {
      return {
        type: "ai_action_classify",
        text,
        classification: categories[0],
        confidence: 0.85,
        categories
      }
    }

    // TODO: Implement actual classification
    return {
      type: "ai_action_classify",
      text,
      classification: categories[0] || "unknown",
      confidence: 0.5,
      categories
    }
  }
}