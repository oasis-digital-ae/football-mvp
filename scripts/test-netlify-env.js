#!/usr/bin/env node
/**
 * Test Netlify Environment Configuration
 * 
 * This script verifies that the environment variables needed for the
 * weekly leaderboard Netlify function are properly configured.
 * 
 * Usage: node scripts/test-netlify-env.js
 */

// Load environment from .env if present
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf-8').replace(/\r/g, '');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// Helper function (same as in the Netlify function)
function getEnvVar(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

console.log('🔍 Testing Netlify Environment Configuration\n');

// Check for Supabase URL
const SUPABASE_URL = getEnvVar(
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL'
);

console.log('1. Checking SUPABASE_URL...');
if (SUPABASE_URL) {
  console.log('   ✅ Found:', SUPABASE_URL.substring(0, 30) + '...');
  
  // Validate format
  if (SUPABASE_URL.startsWith('https://') && SUPABASE_URL.includes('.supabase.co')) {
    console.log('   ✅ Format looks correct');
  } else {
    console.log('   ⚠️  Warning: URL format might be incorrect');
    console.log('   Expected format: https://xxxxx.supabase.co');
  }
} else {
  console.log('   ❌ NOT FOUND');
  console.log('   Missing one of: VITE_SUPABASE_URL, SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL');
}

// Check for Service Role Key
const SUPABASE_SERVICE_KEY = getEnvVar(
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY'
);

console.log('\n2. Checking SUPABASE_SERVICE_ROLE_KEY...');
if (SUPABASE_SERVICE_KEY) {
  console.log('   ✅ Found:', SUPABASE_SERVICE_KEY.substring(0, 20) + '...');
  
  // Validate format (service role keys are longer than anon keys)
  if (SUPABASE_SERVICE_KEY.length > 100) {
    console.log('   ✅ Length looks correct for service_role key');
  } else {
    console.log('   ⚠️  Warning: Key seems too short. Make sure you\'re using the service_role key, not the anon key!');
  }
} else {
  console.log('   ❌ NOT FOUND');
  console.log('   Missing one of: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY');
}

// Check Node.js version
console.log('\n3. Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

console.log('   Current version:', nodeVersion);
if (majorVersion >= 20) {
  console.log('   ✅ Node.js 20+ (Good!)');
} else if (majorVersion >= 18) {
  console.log('   ⚠️  Node.js 18 (Works but deprecated)');
  console.log('   Recommendation: Upgrade to Node.js 20+');
} else {
  console.log('   ❌ Node.js version too old');
  console.log('   Requirement: Node.js 20+');
}

// Final summary
console.log('\n' + '='.repeat(50));
const allGood = SUPABASE_URL && SUPABASE_SERVICE_KEY && majorVersion >= 18;

if (allGood) {
  console.log('✅ All checks passed!');
  console.log('\nNext steps:');
  console.log('1. Make sure these EXACT variables are set in Netlify');
  console.log('2. Go to: Netlify Dashboard → Site → Environment variables');
  console.log('3. Add: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  console.log('4. Set scope to "Functions" or "All"');
  console.log('5. Redeploy your site');
} else {
  console.log('❌ Some checks failed');
  console.log('\nWhat to do:');
  if (!SUPABASE_URL) {
    console.log('- Add SUPABASE_URL to your .env file or Netlify');
  }
  if (!SUPABASE_SERVICE_KEY) {
    console.log('- Add SUPABASE_SERVICE_ROLE_KEY to your .env file or Netlify');
  }
  if (majorVersion < 18) {
    console.log('- Upgrade Node.js to version 20+');
  }
  console.log('\nSee NETLIFY_ENV_SETUP.md for detailed instructions');
}
console.log('='.repeat(50));

process.exit(allGood ? 0 : 1);
