const aes256 = require("aes256");

const ENCRYPTION_KEY = "03f19fe097fd94d87cf3ea042f1a10b13a761c43a737251893c28f1022026e64";
const TEST_DATA = [
  "test-string-1",
  "test-string-with-special-chars-!@#$%^&*()",
  "longer-test-string-that-has-more-than-thirty-two-characters-to-test-with-larger-data",
  JSON.stringify({ foo: "bar", baz: 123, nested: { value: true } })
];

function encrypt(text, secret) {
  const cipher = aes256.createCipher(secret);
  return cipher.encrypt(text);
}

function decrypt(encryptedText, secret) {
  try {
    // Validate inputs
    if (!encryptedText || typeof encryptedText !== 'string') {
      throw new Error('Invalid encrypted text provided');
    }
    
    if (!secret || typeof secret !== 'string') {
      throw new Error('Invalid secret key provided');
    }

    const cipher = aes256.createCipher(secret);
    
    try {
      const decrypted = cipher.decrypt(encryptedText);
      
      // Validate the decrypted result
      if (!decrypted || decrypted.length === 0) {
        throw new Error('Decryption resulted in empty string');
      }
      
      return decrypted;
    } catch (innerError) {
      // Handle specific aes256 errors
      console.error('Decryption error:', innerError.message);
      throw new Error(`Decryption failed: ${innerError.message}`);
    }
  } catch (error) {
    // Log the error with specific details but without exposing the encrypted text
    console.error(`Decryption error: ${error.message}, text length: ${encryptedText?.length || 0}`);
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

function testEncryptionImplementation() {
  console.log("Testing encryption implementation with provided key...");
  console.log("Key length:", ENCRYPTION_KEY.length, "characters");
  
  // Test encrypt/decrypt
  console.log("\n=== Test: Direct encrypt/decrypt ===");
  for (const [index, testData] of TEST_DATA.entries()) {
    try {
      console.log(`\nTest data ${index + 1}: "${testData.substring(0, 30)}${testData.length > 30 ? '...' : ''}"`);
      
      const encrypted = encrypt(testData, ENCRYPTION_KEY);
      console.log(`Encrypted: ${encrypted.substring(0, 30)}...`);
      
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY);
      console.log(`Decrypted: ${decrypted.substring(0, 30)}${decrypted.length > 30 ? '...' : ''}`);
      
      if (decrypted === testData) {
        console.log("✅ Success: Decrypted data matches original");
      } else {
        console.log("❌ Failure: Decrypted data does not match original");
      }
    } catch (error) {
      console.error(`❌ Error during test ${index + 1}:`, error.message);
    }
  }
  
  // Test with different key lengths
  console.log("\n=== Test: Different key lengths ===");
  const testKeys = [
    ENCRYPTION_KEY,
    ENCRYPTION_KEY.substring(0, 32), // 32 characters
    ENCRYPTION_KEY.substring(0, 16), // 16 characters
    "short-key" // Very short key
  ];
  
  for (const [keyIndex, testKey] of testKeys.entries()) {
    console.log(`\nTesting with key ${keyIndex + 1}: length=${testKey.length} characters`);
    
    try {
      const testData = TEST_DATA[0];
      const encrypted = encrypt(testData, testKey);
      console.log(`Encrypted: ${encrypted.substring(0, 30)}...`);
      
      const decrypted = decrypt(encrypted, testKey);
      console.log(`Decrypted: ${decrypted}`);
      
      if (decrypted === testData) {
        console.log("✅ Success: Decrypted data matches original");
      } else {
        console.log("❌ Failure: Decrypted data does not match original");
      }
    } catch (error) {
      console.error(`❌ Error with key ${keyIndex + 1}:`, error.message);
    }
  }
  
  // Provide summary
  console.log("\n=== Summary ===");
  console.log("If all tests passed, the encryption implementation is working correctly with the provided key.");
  console.log("If any tests failed, there might be issues with the key format or the aes256 library.");
}

testEncryptionImplementation();
