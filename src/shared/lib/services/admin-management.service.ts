// Admin Management Service for Supabase Auth
// Utility functions for managing admin roles using Supabase user_metadata

import { supabase } from '../supabase';
import { logger } from '../logger';

export const adminManagementService = {
  /**
   * Make a user an admin via Supabase auth user_metadata
   */
  async makeUserAdmin(userId: string): Promise<void> {
    try {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { role: 'admin' }
      });
      
      if (error) {
        logger.error('Failed to make user admin:', error);
        throw error;
      }
      
      logger.info('User promoted to admin:', userId);
    } catch (error) {
      logger.error('Error in makeUserAdmin:', error);
      throw error;
    }
  },

  /**
   * Remove admin status from user
   */
  async removeUserAdmin(userId: string): Promise<void> {
    try {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { role: 'user' }
      });
      
      if (error) {
        logger.error('Failed to remove admin status:', error);
        throw error;
      }
      
      logger.info('Admin status removed:', userId);
    } catch (error) {
      logger.error('Error in removeUserAdmin:', error);
      throw error;
    }
  },

  /**
   * Check if current user is admin using Supabase auth
   */
  async isCurrentUserAdmin(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const role = user.user_metadata?.role;
      const isAdmin = role === 'admin';
      
      logger.debug('Admin check:', { userId: user.id, role, isAdmin });
      return isAdmin;
    } catch (error) {
      logger.error('Error checking admin status:', error);
      return false;
    }
  },

  /**
   * Get all admin users from Supabase auth
   */
  async getAdminUsers(): Promise<any[]> {
    try {
      const { data, error } = await supabase.auth.admin.listUsers();
      if (error) {
        logger.error('Failed to list users:', error);
        throw error;
      }
      
      const adminUsers = data.users.filter(user => 
        user.user_metadata?.role === 'admin'
      );
      
      logger.info('Found admin users:', adminUsers.length);
      return adminUsers;
    } catch (error) {
      logger.error('Error getting admin users:', error);
      throw error;
    }
  },

  /**
   * Check if user is admin by email
   */
  async isUserAdminByEmail(email: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.auth.admin.listUsers();
      if (error) {
        logger.error('Failed to list users:', error);
        throw error;
      }
      
      const user = data.users.find(u => u.email === email);
      const isAdmin = user?.user_metadata?.role === 'admin';
      
      logger.debug('Admin check by email:', { email, isAdmin });
      return isAdmin;
    } catch (error) {
      logger.error('Error checking admin by email:', error);
      return false;
    }
  },

  /**
   * Migrate existing admin users from database to Supabase auth
   * Run this after getting current admins from get_current_admins.sql
   */
  async migrateExistingAdmins(adminUserIds: string[]): Promise<void> {
    try {
      logger.info('Starting admin migration for users:', adminUserIds);
      
      for (const userId of adminUserIds) {
        await this.makeUserAdmin(userId);
        logger.info('Migrated admin:', userId);
      }
      
      logger.info('Admin migration completed successfully');
    } catch (error) {
      logger.error('Error during admin migration:', error);
      throw error;
    }
  },

  /**
   * Reset a user's password directly (admin only)
   * This bypasses the password reset email flow
   */
  async resetUserPassword(email: string, newPassword: string): Promise<void> {
    try {
      // First, find the user by email
      const { data: users, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        logger.error('Failed to list users:', listError);
        throw listError;
      }

      const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!user) {
        throw new Error(`User with email ${email} not found`);
      }

      // Update the user's password directly
      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        password: newPassword
      });

      if (updateError) {
        logger.error('Failed to reset password:', updateError);
        throw updateError;
      }

      logger.info('Password reset successfully for user:', email);
    } catch (error) {
      logger.error('Error resetting password:', error);
      throw error;
    }
  }
};
