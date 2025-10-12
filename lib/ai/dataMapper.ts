import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"

import { logger } from '@/lib/utils/logger'

const FieldMappingSchema = z.object({
  source_field: z.string(),
  target_field: z.string(),
  confidence: z.number().min(0).max(1),
  transformation: z
    .object({
      type: z.enum(["direct", "format", "calculate", "lookup", "conditional"]),
      expression: z.string().optional(),
      description: z.string(),
    })
    .optional(),
  reasoning: z.string(),
})

const DataMappingSchema = z.object({
  mappings: z.array(FieldMappingSchema),
  unmapped_source_fields: z.array(z.string()),
  unmapped_target_fields: z.array(z.string()),
  confidence_score: z.number().min(0).max(1),
  suggested_transformations: z.array(
    z.object({
      description: z.string(),
      code: z.string(),
      fields_affected: z.array(z.string()),
    }),
  ),
})

export async function generateDataMapping(sourceSchema: any, targetSchema: any, context?: any) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: DataMappingSchema,
      prompt: `
        Generate intelligent field mappings between these data schemas:
        
        Source Schema: ${JSON.stringify(sourceSchema, null, 2)}
        Target Schema: ${JSON.stringify(targetSchema, null, 2)}
        ${context ? `Context: ${JSON.stringify(context, null, 2)}` : ""}
        
        Rules:
        1. Match fields by name similarity, data type, and semantic meaning
        2. Suggest transformations for format differences (dates, numbers, etc.)
        3. Identify calculated fields and suggest expressions
        4. Handle nested objects and arrays appropriately
        5. Consider common business logic patterns
        
        Provide confidence scores and reasoning for each mapping.
      `,
    })

    return {
      success: true,
      mapping: object,
    }
  } catch (error) {
    logger.error("Error generating data mapping:", error)
    return {
      success: false,
      error: "Failed to generate data mapping",
    }
  }
}

export async function suggestDataTransformations(data: any, targetFormat: string) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        transformations: z.array(
          z.object({
            field: z.string(),
            current_format: z.string(),
            target_format: z.string(),
            transformation_code: z.string(),
            description: z.string(),
            confidence: z.number().min(0).max(1),
          }),
        ),
      }),
      prompt: `
        Analyze this data and suggest transformations to match the target format:
        
        Sample Data: ${JSON.stringify(data, null, 2)}
        Target Format: ${targetFormat}
        
        Suggest JavaScript transformation code for each field that needs conversion.
        Consider:
        1. Date format conversions
        2. Number formatting
        3. String transformations
        4. Data type conversions
        5. Validation and sanitization
      `,
    })

    return {
      success: true,
      transformations: object.transformations,
    }
  } catch (error) {
    logger.error("Error suggesting transformations:", error)
    return {
      success: false,
      error: "Failed to suggest transformations",
    }
  }
}

export async function detectDataPatterns(executionData: any[]) {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        patterns: z.array(
          z.object({
            type: z.string(),
            description: z.string(),
            frequency: z.number(),
            confidence: z.number().min(0).max(1),
            examples: z.array(z.any()),
            suggested_optimizations: z.array(z.string()),
          }),
        ),
      }),
      prompt: `
        Analyze this execution data to identify patterns:
        ${JSON.stringify(executionData.slice(-50), null, 2)}
        
        Look for:
        1. Data format patterns
        2. Value distributions
        3. Temporal patterns
        4. Error patterns
        5. Performance patterns
        6. Usage patterns
        
        Suggest optimizations based on discovered patterns.
      `,
    })

    return {
      success: true,
      patterns: object.patterns,
    }
  } catch (error) {
    logger.error("Error detecting patterns:", error)
    return {
      success: false,
      error: "Failed to detect patterns",
    }
  }
}
