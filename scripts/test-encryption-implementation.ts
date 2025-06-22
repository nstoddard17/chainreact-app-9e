import { encrypt, decrypt } from "../lib/security/encryption"
import aes256 from "aes256"

const ENCRYPTION_KEY = "03f19fe097fd94d87cf3ea042f1a10b13a761c43a737251893c28f1022026e64"
const TEST_DATA = [
  "test-string-1",
  "test-string-with-special-chars-!@#$%^&*()",
  "longer-test-string-that-has-more-than-thirty-two-characters-to-test-with-larger-data",
  JSON.stringify({ foo: "bar", baz: 123, nested: { value: true } })
]

function testEncryptionImplementation() {
  console.log("Testing encryption implementation with provided key...")
  console.log("Key length:", ENCRYPTION_KEY.length, "characters")
  
  // Test 1: Direct encrypt/decrypt using our implementation
  console.log("\n=== Test 1: Direct encrypt/decrypt using our implementation ===")
  for (const [index, testData] of TEST_DATA.entries()) {
    try {
      console.log(`\nTest data ${index + 1}: "${testData.substring(0, 30)}${testData.length > 30 ? '...' : ''}"`)
      
      const encrypted = encrypt(testData, ENCRYPTION_KEY)
      console.log(`Encrypted: ${encrypted.substring(0, 30)}...`)
      
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY)
      console.log(`Decrypted: ${decrypted.substring(0, 30)}${decrypted.length > 30 ? '...' : ''}`)
      
      if (decrypted === testData) {
        console.log("✅ Success: Decrypted data matches original")
      } else {
        console.log("❌ Failure: Decrypted data does not match original")
      }
    } catch (error: any) {
      console.error(`❌ Error during test ${index + 1}:`, error.message)
    }
  }
  
  // Test 2: Raw aes256 library usage
  console.log("\n=== Test 2: Raw aes256 library usage ===")
  for (const [index, testData] of TEST_DATA.entries()) {
    try {
      console.log(`\nTest data ${index + 1}: "${testData.substring(0, 30)}${testData.length > 30 ? '...' : ''}"`)
      
      const cipher = aes256.createCipher(ENCRYPTION_KEY)
      const encrypted = cipher.encrypt(testData)
      console.log(`Encrypted: ${encrypted.substring(0, 30)}...`)
      
      const decrypted = cipher.decrypt(encrypted)
      console.log(`Decrypted: ${decrypted.substring(0, 30)}${decrypted.length > 30 ? '...' : ''}`)
      
      if (decrypted === testData) {
        console.log("✅ Success: Decrypted data matches original")
      } else {
        console.log("❌ Failure: Decrypted data does not match original")
      }
    } catch (error: any) {
      console.error(`❌ Error during test ${index + 1}:`, error.message)
    }
  }
  
  // Test 3: Cross-compatibility between implementations
  console.log("\n=== Test 3: Cross-compatibility between implementations ===")
  for (const [index, testData] of TEST_DATA.entries()) {
    try {
      console.log(`\nTest data ${index + 1}: "${testData.substring(0, 30)}${testData.length > 30 ? '...' : ''}"`)
      
      // Encrypt with our implementation, decrypt with raw library
      const encrypted1 = encrypt(testData, ENCRYPTION_KEY)
      const cipher1 = aes256.createCipher(ENCRYPTION_KEY)
      const decrypted1 = cipher1.decrypt(encrypted1)
      
      console.log("Our encrypt → Raw decrypt:")
      if (decrypted1 === testData) {
        console.log("✅ Success: Decrypted data matches original")
      } else {
        console.log("❌ Failure: Decrypted data does not match original")
      }
      
      // Encrypt with raw library, decrypt with our implementation
      const cipher2 = aes256.createCipher(ENCRYPTION_KEY)
      const encrypted2 = cipher2.encrypt(testData)
      const decrypted2 = decrypt(encrypted2, ENCRYPTION_KEY)
      
      console.log("Raw encrypt → Our decrypt:")
      if (decrypted2 === testData) {
        console.log("✅ Success: Decrypted data matches original")
      } else {
        console.log("❌ Failure: Decrypted data does not match original")
      }
    } catch (error: any) {
      console.error(`❌ Error during test ${index + 1}:`, error.message)
    }
  }
  
  // Provide summary and recommendations
  console.log("\n=== Summary ===")
  console.log("If all tests passed, the encryption implementation is working correctly with the provided key.")
  console.log("If any tests failed, there might be issues with the encryption implementation or the key format.")
  console.log("\nPossible issues if tests failed:")
  console.log("1. The key format is incorrect (e.g., it needs to be converted to a Buffer)")
  console.log("2. The aes256 library version has changed and has different behavior")
  console.log("3. There are bugs in the encryption/decryption implementation")
}

testEncryptionImplementation() 