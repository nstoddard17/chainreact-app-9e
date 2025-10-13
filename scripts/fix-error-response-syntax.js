/**
 * Fix incorrect errorResponse syntax from the first script
 */

import fs from 'fs';
import { glob } from 'glob';

async function fixErrorResponseSyntax() {
  const files = await glob('app/api/**/route.ts', { cwd: process.cwd(), absolute: true });

  let fixed = 0;

  for (const filePath of files) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;

    // Fix pattern: errorResponse('msg', key: value , 500)
    // Should be: errorResponse('msg', 500, { key: value })
    content = content.replace(
      /errorResponse\(([^,]+),\s*(\w+):\s*([^,]+)\s*,\s*(\d+)\)/g,
      'errorResponse($1, $4, { $2: $3 })'
    );

    // Fix pattern: errorResponse('msg',\n  key: value\n, 500)
    content = content.replace(
      /errorResponse\(([^,]+),\s*\n\s*(\w+):\s*([^\n]+)\s*\n\s*,\s*(\d+)\)/g,
      'errorResponse($1, $4, { $2: $3 })'
    );

    // Fix multiline pattern
    content = content.replace(
      /errorResponse\(([^,]+),\s*\n\s+(\w+):\s*([^\n]+)\s*\n\s+,\s*(\d+)\)/g,
      'errorResponse($1, $4, { $2: $3 })'
    );

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ Fixed: ${filePath}`);
      fixed++;
    }
  }

  console.log(`\n✅ Fixed ${fixed} files`);
}

fixErrorResponseSyntax().catch(console.error);
