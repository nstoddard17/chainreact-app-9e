import fs from 'fs';
import { glob } from 'glob';

async function addMissingImports() {
  const files = await glob('app/api/**/route.ts', { cwd: process.cwd(), absolute: true });
  let fixed = 0;

  for (const filePath of files) {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Check if file uses the helpers but doesn't have the import
    const usesHelpers = content.includes('jsonResponse') || content.includes('errorResponse');
    const hasImport = content.includes('api-response');

    if (usesHelpers && !hasImport) {
      // Find the import from next/server line and add our import after it
      if (content.includes('from "next/server"') || content.includes("from 'next/server'")) {
        content = content.replace(
          /(import.*from ['"]next\/server['"])/,
          `$1\nimport { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'`
        );

        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ Fixed: ${filePath}`);
        fixed++;
      }
    }
  }

  console.log(`\n✅ Fixed ${fixed} files`);
}

addMissingImports().catch(console.error);
