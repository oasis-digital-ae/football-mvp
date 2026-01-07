// Password Reset Utility Script
// Run this script to reset a user's password directly
// Usage: Update the email and newPassword variables below, then run: npx tsx scripts/reset-password.ts

import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Replace these with your actual Supabase credentials
// You can find these in your Supabase project settings
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY';

// User details to reset
const USER_EMAIL = 'amiri@miriassociates.com';
const NEW_PASSWORD = 'TempPassword123!'; // Change this to your desired password

async function resetPassword() {
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    console.error('❌ Error: Please set VITE_SUPABASE_URL environment variable');
    return;
  }

  if (!SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY === 'YOUR_SERVICE_ROLE_KEY') {
    console.error('❌ Error: Please set SUPABASE_SERVICE_ROLE_KEY environment variable');
    console.log('💡 You can find your service role key in Supabase Dashboard > Settings > API');
    return;
  }

  // Create admin client with service role key
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    console.log(`🔍 Looking up user: ${USER_EMAIL}...`);
    
    // Find user by email
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }

    const user = users.users.find(u => u.email?.toLowerCase() === USER_EMAIL.toLowerCase());
    
    if (!user) {
      console.error(`❌ User with email ${USER_EMAIL} not found`);
      return;
    }

    console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);
    console.log(`🔐 Resetting password...`);

    // Reset password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: NEW_PASSWORD
    });

    if (updateError) {
      throw new Error(`Failed to reset password: ${updateError.message}`);
    }

    console.log(`✅ Password reset successfully!`);
    console.log(`📧 Email: ${USER_EMAIL}`);
    console.log(`🔑 New Password: ${NEW_PASSWORD}`);
    console.log(`\n⚠️  IMPORTANT: Share this password securely with the user and ask them to change it after logging in.`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetPassword();



