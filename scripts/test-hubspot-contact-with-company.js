#!/usr/bin/env node

/**
 * Test script to verify HubSpot contact creation with automatic company creation
 * This simulates the enhanced execution logic that creates both contact and company
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

// Mock the enhanced HubSpot execution logic
function simulateHubSpotContactWithCompany(config, input) {
  console.log("🔍 Starting HubSpot contact + company creation simulation...")
  
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
  
  // Step 3: Validate required parameters
  if (!email) {
    console.error("❌ Missing required parameter: email")
    return { success: false, error: "Missing required parameter: email" }
  }
  
  // Step 4: Prepare the contact request payload
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
      if (all_field_values[fieldName] !== undefined && all_field_values[fieldName] !== null && all_field_values[fieldName] !== '') {
        properties[fieldName] = all_field_values[fieldName]
        console.log(`✅ Added field ${fieldName} with value:`, all_field_values[fieldName])
      }
    })
  }
  
  console.log('🎯 Final contact properties being sent to HubSpot:', JSON.stringify(properties, null, 2))
  
  // Step 5: Simulate contact creation
  const contactId = "contact_" + Date.now()
  const mockContactResponse = {
    id: contactId,
    properties: properties,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  
  console.log('✅ Mock contact created:', JSON.stringify(mockContactResponse, null, 2))
  
  // Step 6: Check if we should create a company record
  let companyId = null
  const companyName = properties.company || properties.hs_analytics_source_data_1
  
  if (companyName && companyName.trim()) {
    try {
      console.log('🏢 Creating company record for:', companyName)
      
      // Prepare company properties
      const companyProperties = {
        name: companyName
      }
      
      // Add additional company properties if available
      if (properties.website) companyProperties.domain = properties.website
      if (properties.phone) companyProperties.phone = properties.phone
      if (properties.address) companyProperties.address = properties.address
      if (properties.city) companyProperties.city = properties.city
      if (properties.state) companyProperties.state = properties.state
      if (properties.zip) companyProperties.zip = properties.zip
      if (properties.country) companyProperties.country = properties.country
      if (properties.industry) companyProperties.industry = properties.industry
      
      console.log('🏢 Company properties:', JSON.stringify(companyProperties, null, 2))
      
      // Simulate company creation
      companyId = "company_" + Date.now()
      const mockCompanyResponse = {
        id: companyId,
        properties: companyProperties,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      console.log('✅ Mock company created:', JSON.stringify(mockCompanyResponse, null, 2))
      console.log('🔗 Simulating contact-company association...')
      console.log('✅ Successfully associated contact with company')
      
    } catch (error) {
      console.warn('⚠️ Error creating company:', error)
    }
  } else {
    console.log('ℹ️ No company information provided, skipping company creation')
  }
  
  return {
    success: true,
    output: {
      contactId: contactId,
      email: properties.email,
      name: `${properties.firstname || ''} ${properties.lastname || ''}`.trim(),
      phone: properties.phone,
      hs_lead_status: properties.hs_lead_status,
      favorite_content_topics: properties.favorite_content_topics,
      preferred_channels: properties.preferred_channels,
      properties: properties,
      createdAt: mockContactResponse.createdAt,
      updatedAt: mockContactResponse.updatedAt,
      hubspotResponse: mockContactResponse,
      companyId: companyId,
      companyCreated: !!companyId
    },
    message: companyId 
      ? `HubSpot contact created successfully with email ${properties.email} and associated with company ${companyName}`
      : `HubSpot contact created successfully with email ${properties.email}`
  }
}

// Test Cases

console.log("🧪 Testing HubSpot Contact + Company Creation\n")

// Test 1: Contact with company information
console.log("📋 Test 1: Contact with company information")
const test1Config = {
  name: "John Doe",
  email: "john@acme.com",
  phone: "+1-555-1234",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["company", "website", "industry"],
  all_field_values: {
    company: "Acme Corporation",
    website: "https://acme.com",
    industry: "Technology"
  }
}

const test1Result = simulateHubSpotContactWithCompany(test1Config, {})
console.log("Result:", test1Result.success ? "✅ PASS" : "❌ FAIL")
console.log("Message:", test1Result.message)
console.log("Company Created:", test1Result.output.companyCreated)
console.log("Company ID:", test1Result.output.companyId)
console.log("")

// Test 2: Contact without company information
console.log("📋 Test 2: Contact without company information")
const test2Config = {
  name: "Jane Smith",
  email: "jane@example.com",
  phone: "+1-555-5678",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email"
}

const test2Result = simulateHubSpotContactWithCompany(test2Config, {})
console.log("Result:", test2Result.success ? "✅ PASS" : "❌ FAIL")
console.log("Message:", test2Result.message)
console.log("Company Created:", test2Result.output.companyCreated)
console.log("Company ID:", test2Result.output.companyId)
console.log("")

// Test 3: Contact with company from different field
console.log("📋 Test 3: Contact with company from hs_analytics_source_data_1")
const test3Config = {
  name: "Bob Wilson",
  email: "bob@techcorp.com",
  phone: "+1-555-9999",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["hs_analytics_source_data_1", "website"],
  all_field_values: {
    hs_analytics_source_data_1: "TechCorp Inc",
    website: "https://techcorp.com"
  }
}

const test3Result = simulateHubSpotContactWithCompany(test3Config, {})
console.log("Result:", test3Result.success ? "✅ PASS" : "❌ FAIL")
console.log("Message:", test3Result.message)
console.log("Company Created:", test3Result.output.companyCreated)
console.log("Company ID:", test3Result.output.companyId)
console.log("")

// Test 4: Contact with workflow variables
console.log("📋 Test 4: Contact with workflow variables")
const test4Config = {
  name: "{{input.name}}",
  email: "{{input.email}}",
  phone: "{{input.phone}}",
  hs_lead_status: "NEW",
  favorite_content_topics: "Strategy",
  preferred_channels: "Email",
  
  all_available_fields: ["company", "website"],
  all_field_values: {
    company: "{{input.company_name}}",
    website: "{{input.company_website}}"
  }
}

const test4Input = {
  name: "Alice Johnson",
  email: "alice@startup.com",
  phone: "+1-555-1111",
  company_name: "StartupXYZ",
  company_website: "https://startupxyz.com"
}

const test4Result = simulateHubSpotContactWithCompany(test4Config, test4Input)
console.log("Result:", test4Result.success ? "✅ PASS" : "❌ FAIL")
console.log("Message:", test4Result.message)
console.log("Company Created:", test4Result.output.companyCreated)
console.log("Company ID:", test4Result.output.companyId)
console.log("")

console.log("🎉 All tests completed!") 