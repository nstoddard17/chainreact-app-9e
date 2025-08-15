import fs from 'fs';

// Read .env.local
let envContent = fs.readFileSync('.env.local', 'utf8');

// Replace localhost with ngrok URL
envContent = envContent.replace(
  'NEXT_PUBLIC_BASE_URL=http://localhost:3000',
  'NEXT_PUBLIC_BASE_URL=https://d51c5de76bf3.ngrok-free.app'
);
envContent = envContent.replace(
  'NEXT_PUBLIC_APP_URL=http://localhost:3000',
  'NEXT_PUBLIC_APP_URL=https://d51c5de76bf3.ngrok-free.app'
);

// Write back to .env.local
fs.writeFileSync('.env.local', envContent);
console.log('✅ Switched to ngrok URLs - restart dev server');