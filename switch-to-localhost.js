import fs from 'fs';

// Read .env.local
let envContent = fs.readFileSync('.env.local', 'utf8');

// Replace ngrok URL with localhost
envContent = envContent.replace(
  'NEXT_PUBLIC_BASE_URL=https://d51c5de76bf3.ngrok-free.app',
  'NEXT_PUBLIC_BASE_URL=http://localhost:3000'
);
envContent = envContent.replace(
  'NEXT_PUBLIC_APP_URL=https://d51c5de76bf3.ngrok-free.app',
  'NEXT_PUBLIC_APP_URL=http://localhost:3000'
);

// Write back to .env.local
fs.writeFileSync('.env.local', envContent);
console.log('✅ Switched to localhost URLs - restart dev server');