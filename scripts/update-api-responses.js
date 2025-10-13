/**
 * Script to update all API routes to use the new jsonResponse helper
 * This adds charset=utf-8 to all JSON responses
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// Find all route.ts files in app/api
const apiRoutesPattern = 'app/api/**/route.ts';

async function updateApiRoutes() {
  console.log('🔍 Finding all API route files...');

  const files = await glob(apiRoutesPattern, {
    cwd: process.cwd(),
    absolute: true
  });

  console.log(`📁 Found ${files.length} API route files\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Skip if already has the import
      if (content.includes('from \'@/lib/utils/api-response\'')) {
        console.log(`⏭️  Skipped (already updated): ${path.relative(process.cwd(), filePath)}`);
        skippedCount++;
        continue;
      }

      // Skip if no NextResponse.json or Response.json
      if (!content.includes('NextResponse.json') && !content.includes('Response.json')) {
        console.log(`⏭️  Skipped (no JSON responses): ${path.relative(process.cwd(), filePath)}`);
        skippedCount++;
        continue;
      }

      let newContent = content;
      let changed = false;

      // Add import after NextResponse import
      if (content.includes('from \'next/server\'') && !content.includes('api-response')) {
        const importRegex = /(import.*from ['"]next\/server['"])/;
        newContent = newContent.replace(
          importRegex,
          `$1\nimport { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'`
        );
        changed = true;
      }

      // Replace NextResponse.json with appropriate helper
      // Pattern 1: Error responses with status 4xx or 5xx
      newContent = newContent.replace(
        /NextResponse\.json\(\s*\{\s*error:\s*([^}]+)\s*\}\s*,\s*\{\s*status:\s*(\d+)\s*\}\s*\)/g,
        (match, errorMsg, status) => {
          changed = true;
          return `errorResponse(${errorMsg}, ${status})`;
        }
      );

      // Pattern 2: Simple error responses
      newContent = newContent.replace(
        /NextResponse\.json\(\s*\{\s*error:\s*([^,}]+)\s*,([^}]+)\}\s*,\s*\{\s*status:\s*(\d+)\s*\}\s*\)/g,
        (match, errorMsg, details, status) => {
          changed = true;
          return `errorResponse(${errorMsg}, ${status}, {${details}})`;
        }
      );

      // Pattern 3: Success responses (any other NextResponse.json)
      newContent = newContent.replace(
        /NextResponse\.json\(/g,
        (match) => {
          changed = true;
          return 'jsonResponse(';
        }
      );

      // Also replace Response.json
      newContent = newContent.replace(
        /Response\.json\(/g,
        (match) => {
          changed = true;
          return 'jsonResponse(';
        }
      );

      if (changed) {
        fs.writeFileSync(filePath, newContent, 'utf-8');
        console.log(`✅ Updated: ${path.relative(process.cwd(), filePath)}`);
        updatedCount++;
      } else {
        console.log(`⏭️  No changes needed: ${path.relative(process.cwd(), filePath)}`);
        skippedCount++;
      }

    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`✅ Updated: ${updatedCount}`);
  console.log(`⏭️  Skipped: ${skippedCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📁 Total: ${files.length}`);
}

updateApiRoutes().catch(console.error);
