const fs = require('fs');
const path = require('path');

// Define the path to the .env.local file
const envFilePath = path.join(__dirname, '..', '.env.local');

// Define the content of the .env.local file
const envFileContent = `# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Encryption
ENCRYPTION_KEY=03f19fe097fd94d87cf3ea042f1a10b13a761c43a737251893c28f1022026e64

# OpenAI (for AI features)
OPENAI_API_KEY=sk-placeholder

# Other required environment variables
# Add any other required environment variables here
`;

// Write the content to the .env.local file
fs.writeFileSync(envFilePath, envFileContent, 'utf8');
console.log(`Created .env.local file at ${envFilePath}`);
console.log('Note: This file contains placeholder values. Replace them with your actual values before deploying.');
