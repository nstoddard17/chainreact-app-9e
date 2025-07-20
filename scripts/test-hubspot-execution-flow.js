#!/usr/bin/env node

/**
 * Test script to verify HubSpot execution flow with additional fields
 * This simulates the execution logic without making actual API calls
 */

// Mock the resolveValue function
function resolveValue(value, context) {
  // For string templates with {{variable}} syntax
  if (typeof value === 'string') {
    const regex = /\{\{([^}]+)\}\}/g
    return value.replace(regex, (match, path) => {
      const value = getValueByPath(context.input, path.trim())
      return value !== undefined ? String(value) : match
    })
  }
  
  // For objects with nested templates
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map(item => resolveValue(item, context))
    } else {
      const result = {}
      for (const [key, val] of Object.entries(value)) {
        result[key] = resolveValue(val, context)
      }
      return result
    }
  }
  
  return value
}

// Helper function to get value by dot path
function getValueByPath(obj, path) {
  const parts = path.split('.')
  let value = obj
  
  for (const part of parts) {
    value = value?.[part]
    if (value === undefined) {
      return undefined
    }
  }
  
  return value
}

// Mock the HubSpot execution logic
function simulateHubSpotExecution(config, input) {
  console.log("🔍 Starting HubSpot execution simulation...")
  
  // Step 1: Resolve templated values
  const resolvedConfig = resolveValue(config, { input })
  console.log("✅ Resolved config:", JSON.stringify(resolvedConfig, null, 2))
  
  // Step 2: Extract parameters
  const {
    email,
    name,
    phone,
    hs_lead_status,
    favorite_content_topics,
    preferred_channels,
    all_available_fields = [],
    all_field_values = {}
  } = resolvedConfig
  
  // Also resolve the all_field_values object
  const resolvedFieldValues = resolveValue(all_field_values || {}, { input })
  console.log("✅ Resolved field values:", JSON.stringify(resolvedFieldValues, null, 2))
  
  // Step 3: Validate required parameters
  if (!email) {
    console.error("❌ Missing required parameter: email")
    return { success: false, error: "Missing required parameter: email" }
  }
  
  // Step 4: Prepare the request payload
  const properties = {
    email
  }
  
  // Basic Information
  if (name) {
    const nameParts = name.trim().split(' ')
    if (nameParts.length > 0) {
      properties.firstname = nameParts[0]
      if (nameParts.length > 1) {
        properties.lastname = nameParts.slice(1).join(' ')
      }
    }
  }
  
  // Contact Information
  if (phone) properties.phone = phone
  
  // Lead Management
  if (hs_lead_status) properties.hs_lead_status = hs_lead_status
  
  // Content Preferences
  if (favorite_content_topics) properties.favorite_content_topics = favorite_content_topics
  
  // Communication Preferences
  if (preferred_channels) properties.preferred_channels = preferred_channels
  
  // Add all available fields from the comprehensive field selector
  if (all_available_fields && Array.isArray(all_available_fields)) {
    console.log('🔍 Processing all available fields:', all_available_fields)
    console.log('🔍 All field values:', all_field_values)
    
    all_available_fields.forEach(fieldName => {
      // Use values from resolvedFieldValues if available, otherwise fall back to resolvedConfig
      if (resolvedFieldValues[fieldName] !== undefined && resolvedFieldValues[fieldName] !== null && resolvedFieldValues[fieldName] !== '') {
        properties[fieldName] = resolvedFieldValues[fieldName]
        console.log(`✅ Added field ${fieldName} with value:`, resolvedFieldValues[fieldName])
      } else {
        const fieldValue = resolvedConfig[fieldName]
        if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
          properties[fieldName] = fieldValue
          console.log(`✅ Added field ${fieldName} with value from config:`, fieldValue)
        }
      }
    })
  }
  
  console.log('🎯 Final properties being sent to HubSpot:', JSON.stringify(properties, null, 2))
  
  // Step 5: Simulate API response
  const mockResponse = {
    id: "contact_" + Date.now(),
    properties: properties,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  
  console.log('✅ Mock HubSpot API response:', JSON.stringify(mockResponse, null, 2))
  
  return {
    success: true,
    output: {
      contactId: mockResponse.id,
      email: mockResponse.properties.email,
      name: `${mockResponse.properties.firstname || ''} ${mockResponse.properties.lastname || ''}`.trim(),
      phone: mockResponse.properties.phone,
      hs_lead_status: mockResponse.properties.hs_lead_status,
      favorite_content_topics: mockResponse.properties.favorite_content_topics,
      preferred_channels: mockResponse.properties.preferred_channels,
      properties: mockResponse.properties,
      createdAt: mockResponse.createdAt,
      updatedAt: mockResponse.updatedAt,
      hubspotResponse: mockResponse
    },
    message: `HubSpot contact created successfully with email ${mockResponse.properties.email}`
  }
}

// Test Cases

console.log("🧪 Testing HubSpot Execution Flow\n")

// Test 1: Basic fields only
console.log("📋 Test 1: Basic fields only")
const test1Config = {
  name: "Test User",
  email: "test@example.com",
  phone: "+1-555-0000",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email"
}

const test1Result = simulateHubSpotExecution(test1Config, {})
console.log("Result:", test1Result.success ? "✅ PASS" : "❌ FAIL")
console.log("Message:", test1Result.message)
console.log("")

// Test 2: With additional fields
console.log("📋 Test 2: With additional fields")
const test2Config = {
  name: "Test User",
  email: "test@example.com",
  phone: "+1-555-0000",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["jobtitle", "company", "website"],
  all_field_values: {
    jobtitle: "Developer",
    company: "Test Corp",
    website: "https://testcorp.com"
  }
}

const test2Result = simulateHubSpotExecution(test2Config, {})
console.log("Result:", test2Result.success ? "✅ PASS" : "❌ FAIL")
console.log("Message:", test2Result.message)
console.log("")

// Test 3: With workflow variables
console.log("📋 Test 3: With workflow variables")
const test3Config = {
  name: "{{input.name}}",
  email: "{{input.email}}",
  phone: "{{input.phone}}",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["jobtitle", "company"],
  all_field_values: {
    jobtitle: "{{input.job_title}}",
    company: "{{input.company_name}}"
  }
}

const test3Input = {
  name: "John Doe",
  email: "john@example.com",
  phone: "+1-555-1234",
  job_title: "Engineer",
  company_name: "Tech Corp"
}

const test3Result = simulateHubSpotExecution(test3Config, test3Input)
console.log("Result:", test3Result.success ? "✅ PASS" : "❌ FAIL")
console.log("Message:", test3Result.message)
console.log("")

// Test 4: Empty additional fields
console.log("📋 Test 4: Empty additional fields")
const test4Config = {
  name: "Test User",
  email: "test@example.com",
  phone: "+1-555-0000",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["jobtitle", "company"],
  all_field_values: {
    jobtitle: "",
    company: null
  }
}

const test4Result = simulateHubSpotExecution(test4Config, {})
console.log("Result:", test4Result.success ? "✅ PASS" : "❌ FAIL")
console.log("Message:", test4Result.message)
console.log("")

// Test 5: Missing required email
console.log("📋 Test 5: Missing required email")
const test5Config = {
  name: "Test User",
  phone: "+1-555-0000",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email"
}

const test5Result = simulateHubSpotExecution(test5Config, {})
console.log("Result:", test5Result.success ? "✅ PASS" : "❌ FAIL")
console.log("Message:", test5Result.message)
console.log("")

console.log("🎉 All tests completed!") 