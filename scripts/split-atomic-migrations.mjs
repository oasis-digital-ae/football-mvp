#!/usr/bin/env node
/**
 * Splits migration files to isolate functions with "atomic" in the name.
 * Workaround for Supabase CLI parser bug: https://github.com/supabase/cli/issues/4746
 * The parser misparses "atomic" as BEGIN ATOMIC, causing "cannot insert multiple commands into a prepared statement".
 *
 * Usage: node scripts/split-atomic-migrations.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

const ATOMIC_FUNCTIONS = [
  'add_position_atomic',
  'create_or_update_profile_atomic',
  'process_match_result_atomic',
  'process_share_purchase_atomic',
  'process_share_sale_atomic',
];

/**
 * Extract a function block from content. Handles both $$ and $function$ delimiters.
 * Returns { block, startIndex, endIndex } or null.
 */
function extractAtomicFunctionBlock(content, funcName, startFromIndex = 0) {
  const patterns = [
    new RegExp(`"${funcName}"`, 'g'),
    new RegExp(`\\.${funcName}\\(`, 'g'),
  ];

  let createStart = -1;
  for (const re of patterns) {
    re.lastIndex = startFromIndex;
    const m = re.exec(content);
    if (m) {
      createStart = content.lastIndexOf('CREATE OR REPLACE FUNCTION', m.index);
      if (createStart >= startFromIndex) break;
    }
  }
  if (createStart < startFromIndex) return null;

  const afterCreate = content.slice(createStart);

  // Find end: $$; or $function$ followed by newline and ;
  let endMatch;
  const dollarDollarMatch = afterCreate.match(/\$\$;\s*\n/);
  const dollarFunctionMatch = afterCreate.match(/\$function\$\s*\n\s*;/);

  let funcEndInSlice;
  if (dollarDollarMatch) {
    funcEndInSlice = dollarDollarMatch.index + dollarDollarMatch[0].length;
  }
  if (dollarFunctionMatch && (!funcEndInSlice || dollarFunctionMatch.index < funcEndInSlice)) {
    funcEndInSlice = dollarFunctionMatch.index + dollarFunctionMatch[0].length;
  }
  if (!funcEndInSlice) return null;

  let blockEnd = createStart + funcEndInSlice;

  // Include following ALTER FUNCTION and COMMENT ON FUNCTION for this function
  const afterBlock = content.slice(blockEnd);
  const alterCommentMatch = afterBlock.match(
    /^(\s*\n)(ALTER FUNCTION[^;]+;\s*\n*)(COMMENT ON FUNCTION[^;]+;\s*\n*)?/
  );
  if (alterCommentMatch) {
    blockEnd += alterCommentMatch[0].length;
  }

  return {
    block: content.slice(createStart, blockEnd).trim(),
    startIndex: createStart,
    endIndex: blockEnd,
  };
}

/**
 * Extract GRANT lines for a function from content.
 */
function extractGrantsForFunction(content, funcName) {
  const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `GRANT ALL ON FUNCTION[^;]*${escaped}[^;]+;[\\s\\n]*`,
    'g'
  );
  const matches = content.match(re);
  return matches ? matches.join('\n') : '';
}

function processFile(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  let content = fs.readFileSync(filepath, 'utf8');

  const isInitialSchema = filename.includes('initial_schema');
  const isRemoteSchema = filename.includes('remote_schema');

  const timestamp = filename.match(/^(\d+)/)?.[1] || '20250101000000';
  const baseTs = parseInt(timestamp, 10);
  let nextSeq = 1;

  const extracted = [];

  for (const funcName of ATOMIC_FUNCTIONS) {
    let searchFrom = 0;
    let result;
    while ((result = extractAtomicFunctionBlock(content, funcName, searchFrom))) {
      let block = result.block;

      // Add GRANT statements (only for initial_schema which has them at the end)
      if (isInitialSchema) {
        const grants = extractGrantsForFunction(content, funcName);
        if (grants) {
          block += '\n\n\n' + grants;
        }
      }

      const newTs = String(baseTs + nextSeq).padStart(14, '0');
      const newFilename = `${newTs}_${funcName}.sql`;
      extracted.push({ funcName, block, newFilename });
      nextSeq++;

      // Remove from content (block + any trailing newlines before next CREATE)
      const before = content.slice(0, result.startIndex);
      let after = content.slice(result.endIndex);
      // Trim leading newlines from after (preserve at most 2)
      after = after.replace(/^\n+/, '\n\n');
      content = before + after;

      searchFrom = result.startIndex; // Don't advance - we removed content
    }
  }

  if (extracted.length > 0) {
    // Remove GRANT blocks for extracted functions from original (initial_schema only)
    if (isInitialSchema) {
      for (const { funcName } of extracted) {
        const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const grantRe = new RegExp(
          `(\\n\\n)(GRANT ALL ON FUNCTION[^;]*${escaped}[^;]+;[\\s\\n]*){3}`,
          'g'
        );
        content = content.replace(grantRe, '\n\n');
      }
    }
    fs.writeFileSync(filepath, content, 'utf8');
    for (const { block, newFilename } of extracted) {
      const newPath = path.join(MIGRATIONS_DIR, newFilename);
      fs.writeFileSync(newPath, block + '\n', 'utf8');
      console.log(`Created ${newFilename}`);
    }
    console.log(`Updated ${filename} (removed ${extracted.length} atomic functions)`);
  }
}

function main() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const toProcess = files.filter(
    (f) =>
      f.includes('initial_schema') ||
      f.includes('remote_schema')
  );

  for (const f of toProcess) {
    console.log(`\nProcessing ${f}...`);
    processFile(f);
  }
  console.log('\nDone.');
}

main();
